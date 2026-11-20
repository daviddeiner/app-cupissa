-- Cupissa | Señales dinámicas del catálogo (ejecutar después de
-- cupissa_experiencia_clientes_20261120.sql).
-- No crea testimonios ni precios históricos ficticios.

alter table public.productos add column if not exists precio_anterior numeric(14,2);
alter table if exists public.configuracion_destacados_web
  add column if not exists fecha_fin_temporada date;

-- Todas las referencias, incluso las recién creadas, participan automáticamente.
-- Las ventas reales pueden sincronizarse aquí desde los pedidos confirmados.
create table if not exists public.cupissa_ventas_confirmadas (
  producto_id text primary key,
  cantidad integer not null default 0 check (cantidad >= 0),
  updated_at timestamptz not null default now()
);
alter table public.cupissa_ventas_confirmadas enable row level security;
revoke all on public.cupissa_ventas_confirmadas from anon, authenticated;

create or replace function public.cupissa_inicializar_senales_producto()
returns trigger language plpgsql security definer set search_path=public,pg_temp as $$
begin
  insert into public.cupissa_ventas_confirmadas(producto_id,cantidad)
  values(new.id::text,0) on conflict(producto_id) do nothing;
  return new;
end $$;
drop trigger if exists trg_cupissa_senales_producto on public.productos;
create trigger trg_cupissa_senales_producto after insert on public.productos
for each row execute function public.cupissa_inicializar_senales_producto();
insert into public.cupissa_ventas_confirmadas(producto_id,cantidad)
select id::text,0 from public.productos on conflict(producto_id) do nothing;

-- Se recalcula al consultar: cambiar la temporada destacada elimina de inmediato
-- las etiquetas de la temporada anterior; "Último día" caduca solo.
create or replace function public.cupissa_senales_catalogo(p_product_ids text[])
returns table (
  producto_id text,
  precio_anterior numeric,
  es_temporada_destacada boolean,
  es_ultimo_dia boolean,
  es_mas_vendido boolean,
  cantidad_resenas bigint,
  promedio_resenas numeric
) language sql stable security definer set search_path=public,pg_temp as $$
with configuracion as (
  select nullif(trim(coalesce(to_jsonb(c)->>'temporada_destacada','')),'') as temporada,
    nullif(to_jsonb(c)->>'fecha_fin_temporada','')::date as termina
  from public.configuracion_destacados_web c where c.id=1
  limit 1
), candidatos as (
  select p.id::text as id,
    p.precio_anterior,
    (conf.temporada is not null and (
      upper(trim(coalesce(to_jsonb(p)->>'temporada','')))=upper(conf.temporada)
      or exists(select 1 from jsonb_array_elements_text(
        case when jsonb_typeof(to_jsonb(p)->'temporadas')='array'
        then to_jsonb(p)->'temporadas' else '[]'::jsonb end
      ) as t(valor) where upper(trim(t.valor))=upper(conf.temporada))
    )) as temporada,
    conf.termina,
    coalesce(v.cantidad,0) as ventas,
    coalesce((select count(*) from public.cupissa_resenas_verificadas r
      where r.producto_id=p.id::text),0) as cantidad,
    (select round(avg(r.calificacion),2) from public.cupissa_resenas_verificadas r
      where r.producto_id=p.id::text) as promedio
  from public.productos p
  left join public.cupissa_ventas_confirmadas v on v.producto_id=p.id::text
  left join configuracion conf on true
  where p.id::text=any(p_product_ids)
), ranking as (
  select c.*,row_number() over(partition by c.temporada
    order by c.ventas desc,c.id) as posicion
  from candidatos c
)
select id,precio_anterior,temporada,
  temporada and termina=(now() at time zone 'America/Bogota')::date,
  temporada and ventas>0 and posicion<=3,
  cantidad,promedio
from ranking;
$$;
revoke all on function public.cupissa_senales_catalogo(text[]) from public;
grant execute on function public.cupissa_senales_catalogo(text[]) to anon,authenticated;

-- Para usar "Más vendido", actualizar la cantidad con ventas comprobadas.
-- Ejemplo: update public.cupissa_ventas_confirmadas
--          set cantidad = 12, updated_at=now()
--          where producto_id='ID_REAL_DEL_PRODUCTO';
