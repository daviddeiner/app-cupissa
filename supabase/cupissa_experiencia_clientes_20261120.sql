-- CUPISSA | Ejecutar en el editor SQL de Supabase antes de publicar los ZIP.
-- No mostrar descuentos sin un precio anterior verdadero registrado.
alter table public.productos add column if not exists precio_anterior numeric(14,2);
alter table if exists public.configuracion_destacados_web
  add column if not exists fecha_fin_temporada date;
alter table public.productos drop constraint if exists productos_precio_anterior_positivo;
alter table public.productos add constraint productos_precio_anterior_positivo
  check (precio_anterior is null or precio_anterior >= 0);

create table if not exists public.cupissa_resenas_verificadas (
  id uuid primary key default gen_random_uuid(),
  auth_user_id uuid not null references auth.users(id) on delete cascade,
  pedido_id uuid not null references public.pedidos_web(id) on delete cascade,
  producto_id text not null,
  calificacion integer not null check (calificacion between 1 and 5),
  comentario text not null check (char_length(trim(comentario)) between 3 and 400),
  created_at timestamptz not null default now(),
  unique (auth_user_id, producto_id)
);
create index if not exists cupissa_resenas_producto_fecha
  on public.cupissa_resenas_verificadas (producto_id, calificacion desc, created_at desc);
alter table public.cupissa_resenas_verificadas enable row level security;
drop policy if exists cupissa_resenas_lectura_publica on public.cupissa_resenas_verificadas;
create policy cupissa_resenas_lectura_publica on public.cupissa_resenas_verificadas
  for select to anon, authenticated using (true);
revoke all on public.cupissa_resenas_verificadas from anon, authenticated;
-- No divulgar identificadores de cuentas ni pedidos en consultas públicas.
grant select (id,producto_id,calificacion,comentario,created_at)
  on public.cupissa_resenas_verificadas to anon, authenticated;

-- Resumen por lotes: escala cuando los productos acumulen muchas reseñas.
create or replace function public.cupissa_resumen_resenas(p_product_ids text[])
returns table (producto_id text, cantidad bigint, promedio numeric)
language sql stable security invoker set search_path=public as $$
  select r.producto_id, count(*) as cantidad, round(avg(r.calificacion),2) as promedio
  from public.cupissa_resenas_verificadas r
  where r.producto_id=any(p_product_ids)
  group by r.producto_id;
$$;
revoke all on function public.cupissa_resumen_resenas(text[]) from public;
grant execute on function public.cupissa_resumen_resenas(text[]) to anon,authenticated;

create or replace function public.cupissa_mis_resenas(p_producto_ids text[])
returns table (producto_id text)
language sql stable security definer set search_path=public,pg_temp as $$
  select r.producto_id from public.cupissa_resenas_verificadas r
  where r.auth_user_id=auth.uid() and r.producto_id=any(p_producto_ids);
$$;
revoke all on function public.cupissa_mis_resenas(text[]) from public;
grant execute on function public.cupissa_mis_resenas(text[]) to authenticated;

create or replace function public.cupissa_publicar_resena(
  p_pedido_id uuid, p_producto_id text, p_calificacion integer, p_comentario text
) returns uuid language plpgsql security definer set search_path=public,pg_temp as $$
declare v_pedido public.pedidos_web%rowtype; v_id uuid; v_pertenece boolean:=false;
begin
  if auth.uid() is null then raise exception 'Inicia sesión para reseñar.'; end if;
  if p_calificacion not between 1 and 5 or
     char_length(trim(coalesce(p_comentario,''))) not between 3 and 400 then
    raise exception 'Completa las estrellas y un comentario de 3 a 400 caracteres.';
  end if;
  select p.* into v_pedido from public.pedidos_web p
  join public.clientes_web c on c.auth_user_id=auth.uid()
    and (c.id::text = coalesce(to_jsonb(p)->>'cliente_web_id','')
      or c.id::text = coalesce(to_jsonb(p)->>'cliente_id',''))
  where p.id=p_pedido_id
    and upper(trim(p.estado))='ENTREGADO';
  if not found then raise exception 'Solo puedes reseñar pedidos tuyos entregados.'; end if;
  select exists (
    select 1 from jsonb_array_elements(
      case when jsonb_typeof(to_jsonb(v_pedido)->'productos')='array'
        then to_jsonb(v_pedido)->'productos' else '[]'::jsonb end
    ) as item(value)
    where coalesce(item.value->>'productId',item.value->>'producto_id',
      item.value->>'product_id',item.value->>'id','')=p_producto_id
  ) into v_pertenece;
  -- Algunas versiones de CUPISSA guardan los artículos en tabla separada.
  if not v_pertenece and to_regclass('public.pedidos_web_productos') is not null then
    execute $q$
      select exists(select 1 from public.pedidos_web_productos item
        where coalesce(to_jsonb(item)->>'pedido_id',to_jsonb(item)->>'pedido_web_id','')=$1
        and coalesce(to_jsonb(item)->>'producto_id',to_jsonb(item)->>'productId',
          to_jsonb(item)->>'product_id','')=$2)
    $q$ into v_pertenece using p_pedido_id::text,p_producto_id;
  end if;
  if not v_pertenece then
    raise exception 'Este producto no pertenece a tu pedido entregado.';
  end if;
  insert into public.cupissa_resenas_verificadas
    (auth_user_id,pedido_id,producto_id,calificacion,comentario)
  values (auth.uid(),p_pedido_id,p_producto_id,p_calificacion,trim(p_comentario))
  returning id into v_id;
  return v_id;
exception when unique_violation then
  raise exception 'Ya publicaste una reseña para este producto.';
end $$;
revoke all on function public.cupissa_publicar_resena(uuid,text,integer,text) from public;
grant execute on function public.cupissa_publicar_resena(uuid,text,integer,text) to authenticated;

create table if not exists public.cupissa_pedido_eventos (
  id bigint generated always as identity primary key,
  pedido_id uuid not null references public.pedidos_web(id) on delete cascade,
  codigo text not null,
  estado text not null,
  created_at timestamptz not null default now()
);
create index if not exists cupissa_pedido_eventos_por_pedido
  on public.cupissa_pedido_eventos (pedido_id,created_at desc);
alter table public.cupissa_pedido_eventos enable row level security;
drop policy if exists cupissa_pedido_eventos_cliente on public.cupissa_pedido_eventos;
create policy cupissa_pedido_eventos_cliente on public.cupissa_pedido_eventos
  for select to authenticated using (exists (
    select 1 from public.pedidos_web p join public.clientes_web c
      on c.auth_user_id=auth.uid()
      and (c.id::text = coalesce(to_jsonb(p)->>'cliente_web_id','')
        or c.id::text = coalesce(to_jsonb(p)->>'cliente_id',''))
    where p.id=pedido_id
  ));
grant select on public.cupissa_pedido_eventos to authenticated;
revoke insert, update, delete on public.cupissa_pedido_eventos from anon, authenticated;

create or replace function public.cupissa_registrar_cambio_pedido()
returns trigger language plpgsql security definer set search_path=public,pg_temp as $$
begin
  if tg_op='INSERT' then
    insert into public.cupissa_pedido_eventos(pedido_id,codigo,estado,created_at)
    values (new.id, coalesce(
      nullif(to_jsonb(new)->>'codigo',''),
      nullif(to_jsonb(new)->>'numero_pedido',''),
      nullif(to_jsonb(new)->>'referencia',''),
      'CUP' || left(new.id::text,8)
    ),new.estado,now());
  elsif new.estado is distinct from old.estado then
    insert into public.cupissa_pedido_eventos(pedido_id,codigo,estado,created_at)
    values (new.id, coalesce(
      nullif(to_jsonb(new)->>'codigo',''),
      nullif(to_jsonb(new)->>'numero_pedido',''),
      nullif(to_jsonb(new)->>'referencia',''),
      'CUP' || left(new.id::text,8)
    ),new.estado,now());
  end if;
  return new;
end $$;
drop trigger if exists trg_cupissa_evento_pedido on public.pedidos_web;
create trigger trg_cupissa_evento_pedido
after insert or update of estado on public.pedidos_web
for each row execute function public.cupissa_registrar_cambio_pedido();
-- Registrar solo el estado observado de pedidos anteriores; no inventar transiciones.
insert into public.cupissa_pedido_eventos (pedido_id,codigo,estado,created_at)
select p.id,
  coalesce(nullif(to_jsonb(p)->>'codigo',''),
    nullif(to_jsonb(p)->>'numero_pedido',''),
    nullif(to_jsonb(p)->>'referencia',''),
    'CUP' || left(p.id::text,8)),
  p.estado,
  coalesce(nullif(to_jsonb(p)->>'updated_at','')::timestamptz,
    nullif(to_jsonb(p)->>'created_at','')::timestamptz,now())
from public.pedidos_web p
where not exists (select 1 from public.cupissa_pedido_eventos e where e.pedido_id=p.id);

create or replace function public.cupissa_cancelar_pedido_cliente(p_pedido_id uuid)
returns boolean language plpgsql security definer set search_path=public,pg_temp as $$
declare v_pedido public.pedidos_web%rowtype;
begin
  if auth.uid() is null then raise exception 'Inicia sesión para continuar.'; end if;
  select p.* into v_pedido from public.pedidos_web p
  where p.id=p_pedido_id
    and (
      exists (
        select 1 from public.clientes_web c
        where (c.auth_user_id=auth.uid()
          or (nullif(trim(coalesce(auth.jwt()->>'email','')),'') is not null
            and lower(trim(coalesce(to_jsonb(c)->>'correo','')))=lower(trim(auth.jwt()->>'email'))))
          and (
            c.id::text=coalesce(to_jsonb(p)->>'cliente_web_id','')
            or coalesce(to_jsonb(c)->>'cliente_id','')=coalesce(to_jsonb(p)->>'cliente_id','')
              and nullif(to_jsonb(c)->>'cliente_id','') is not null
            or (
              nullif(to_jsonb(p)->>'cliente_web_id','') is null
              and nullif(to_jsonb(p)->>'cliente_id','') is null
              and nullif(regexp_replace(coalesce(to_jsonb(c)->>'telefono',''),'\D','','g'),'') is not null
              and regexp_replace(coalesce(to_jsonb(c)->>'telefono',''),'\D','','g')
                =regexp_replace(coalesce(to_jsonb(p)->>'telefono',''),'\D','','g')
            )
          )
      )
      or exists (
        select 1 from public.clientes c
        where c.id::text=coalesce(to_jsonb(p)->>'cliente_id','')
          and nullif(trim(coalesce(auth.jwt()->>'email','')),'') is not null
          and lower(trim(coalesce(to_jsonb(c)->>'correo','')))=lower(trim(auth.jwt()->>'email'))
      )
    )
  for update of p;
  if not found then raise exception 'Pedido no encontrado en tu cuenta.'; end if;
  if upper(trim(v_pedido.estado)) not in ('AGENDADO','PENDIENTE') then
    raise exception 'Ya comenzó la fabricación o este pedido no se puede cancelar.';
  end if;
  update public.pedidos_web set estado='CANCELADO' where id=p_pedido_id;
  return true;
end $$;
revoke all on function public.cupissa_cancelar_pedido_cliente(uuid) from public;
grant execute on function public.cupissa_cancelar_pedido_cliente(uuid) to authenticated;

-- Para los mensajes instantáneos habilitar public.cupissa_pedido_eventos
-- en Supabase > Database > Publications > supabase_realtime.
-- El frontend también consulta periódicamente como respaldo.
do $$
begin
  if exists (select 1 from pg_publication where pubname='supabase_realtime')
    and not exists (select 1 from pg_publication_tables
      where pubname='supabase_realtime' and schemaname='public' and tablename='cupissa_pedido_eventos')
  then
    alter publication supabase_realtime add table public.cupissa_pedido_eventos;
  end if;
exception when insufficient_privilege then
  raise notice 'Activa cupissa_pedido_eventos manualmente en supabase_realtime.';
end $$;
