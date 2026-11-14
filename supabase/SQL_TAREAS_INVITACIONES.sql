-- CUPISSA · Ejecutar una vez en Supabase SQL Editor.
-- No concede ningún descuento al invitado: solo suma al contador del invitador.
-- Un premio del 20 % al llegar a 20 invitados, una vez por cuenta, válido 7 días.
create extension if not exists pgcrypto with schema extensions;

create table if not exists public.cupissa_referidos (
  auth_user_id uuid primary key references auth.users(id) on delete cascade,
  codigo text not null unique,
  invitado_por uuid references auth.users(id),
  aceptado_en timestamptz,
  premio_vence_en timestamptz,
  premio_usado_en timestamptz,
  premio_referencia text,
  creado_en timestamptz not null default now(),
  constraint cupissa_no_autoinvitacion check (auth_user_id is distinct from invitado_por)
);
create index if not exists cupissa_referidos_invitador_idx on public.cupissa_referidos(invitado_por);
alter table public.cupissa_referidos enable row level security;
revoke all on public.cupissa_referidos from anon,authenticated;
grant select,insert,update on public.cupissa_referidos to service_role;

create table if not exists public.cupissa_referidos_campana (
  id boolean primary key default true check (id),
  inicio timestamptz not null default now()
);
insert into public.cupissa_referidos_campana(id) values (true) on conflict do nothing;
alter table public.cupissa_referidos_campana enable row level security;
revoke all on public.cupissa_referidos_campana from anon,authenticated;

-- Genera códigos impredecibles para los actuales y futuros usuarios de Auth.
create or replace function public.cupissa_referido_crear(p_usuario uuid)
returns void language plpgsql security definer set search_path=public,extensions,pg_temp as $$
declare v_codigo text; v_intentos int := 0;
begin
  if p_usuario is null or not exists(select 1 from auth.users where id=p_usuario) then return; end if;
  if exists(select 1 from public.cupissa_referidos where auth_user_id=p_usuario) then return; end if;
  loop
    v_codigo := 'CUP' || upper(encode(gen_random_bytes(6),'hex'));
    begin
      insert into public.cupissa_referidos(auth_user_id,codigo) values (p_usuario,v_codigo)
      on conflict (auth_user_id) do nothing;
      exit;
    exception when unique_violation then
      v_intentos := v_intentos+1;
      if v_intentos > 10 then raise; end if;
    end;
  end loop;
end; $$;
revoke all on function public.cupissa_referido_crear(uuid) from public,anon,authenticated;
grant execute on function public.cupissa_referido_crear(uuid) to service_role;

create or replace function public.cupissa_referido_nuevo_usuario()
returns trigger language plpgsql security definer set search_path=public,extensions,pg_temp as $$
begin
  perform public.cupissa_referido_crear(new.id);
  return new;
end; $$;
drop trigger if exists cupissa_referido_auth_nuevo on auth.users;
create trigger cupissa_referido_auth_nuevo after insert on auth.users
for each row execute function public.cupissa_referido_nuevo_usuario();
do $$ declare v_id uuid; begin
  for v_id in select id from auth.users loop
    perform public.cupissa_referido_crear(v_id);
  end loop;
end $$;

-- Único punto de entrada al aceptar códigos, protegido por auth.uid().
create or replace function public.cupissa_referral_accept(p_code text)
returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare v_usuario uuid:=auth.uid(); v_invitador uuid; v_actual uuid;
        v_cuenta int; v_nombre text; v_fecha_registro timestamptz; v_inicio timestamptz;
begin
  if v_usuario is null then raise exception 'Inicia sesión para aceptar una invitación'; end if;
  select created_at into v_fecha_registro from auth.users where id=v_usuario;
  select inicio into v_inicio from public.cupissa_referidos_campana where id=true;
  if v_fecha_registro < v_inicio then
    raise exception 'Solo las cuentas nuevas pueden aceptar códigos de esta campaña';
  end if;
  perform public.cupissa_referido_crear(v_usuario);
  select auth_user_id into v_invitador from public.cupissa_referidos
    where codigo=upper(trim(coalesce(p_code,'')));
  if v_invitador is null then raise exception 'El código de invitación no existe'; end if;
  if v_invitador=v_usuario then raise exception 'No puedes aceptar tu propio código'; end if;
  -- Bloquear la fila del invitador impide que dos aceptaciones superen 20.
  perform 1 from public.cupissa_referidos where auth_user_id=v_invitador for update;
  select invitado_por into v_actual from public.cupissa_referidos
    where auth_user_id=v_usuario for update;
  if v_actual is not null then raise exception 'Ya has aceptado una invitación'; end if;
  select count(*) into v_cuenta from public.cupissa_referidos where invitado_por=v_invitador;
  if v_cuenta>=20 then raise exception 'Este amigo ya completó sus 20 invitaciones'; end if;
  update public.cupissa_referidos set invitado_por=v_invitador, aceptado_en=now()
    where auth_user_id=v_usuario and invitado_por is null;
  if not found then raise exception 'Esta cuenta ya aceptó una invitación'; end if;
  if v_cuenta=19 then
    update public.cupissa_referidos set premio_vence_en=now()+interval '7 days'
      where auth_user_id=v_invitador and premio_vence_en is null;
  end if;
  return jsonb_build_object('ok',true,'message','¡Invitación aceptada! Tu amigo está más cerca de su recompensa.');
end; $$;
revoke all on function public.cupissa_referral_accept(text) from public,anon;
grant execute on function public.cupissa_referral_accept(text) to authenticated;

create or replace function public.cupissa_referral_status()
returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare v_usuario uuid:=auth.uid(); v_fila public.cupissa_referidos%rowtype;
        v_contador int; v_nombre text;
begin
  if v_usuario is null then raise exception 'Inicia sesión para consultar tus tareas'; end if;
  perform public.cupissa_referido_crear(v_usuario);
  select * into v_fila from public.cupissa_referidos where auth_user_id=v_usuario;
  select count(*) into v_contador from public.cupissa_referidos where invitado_por=v_usuario;
  -- Nombre opcional del último invitado; solo retorna nombre, nunca teléfono ni correo.
  select coalesce(nullif(trim(c.nombres || ' ' || c.apellidos),''),'Un amigo') into v_nombre
  from public.cupissa_referidos r
  left join public.clientes_web c on c.auth_user_id=r.auth_user_id
  where r.invitado_por=v_usuario order by r.aceptado_en desc limit 1;
  return jsonb_build_object(
    'code',v_fila.codigo,'invited_by',v_fila.invitado_por,
    'accepted_count',least(20,v_contador),'latest_friend_name',v_nombre,
    'reward_expires_at',v_fila.premio_vence_en,
    'reward_used_at',v_fila.premio_usado_en,
    'reward_active',(v_contador>=20 and v_fila.premio_vence_en>now()
                     and v_fila.premio_usado_en is null and v_fila.premio_referencia is null));
end; $$;
revoke all on function public.cupissa_referral_status() from public,anon;
grant execute on function public.cupissa_referral_status() to authenticated;

-- Las funciones siguientes están reservadas para el endpoint de pagos,
-- nunca para el navegador del cliente (service_role exclusivamente).
create or replace function public.cupissa_referral_reserve(p_usuario uuid,p_referencia text)
returns boolean language plpgsql security definer set search_path=public,pg_temp as $$
begin
  update public.cupissa_referidos r set premio_referencia=p_referencia
  where r.auth_user_id=p_usuario
    and (select count(*) from public.cupissa_referidos i where i.invitado_por=p_usuario)>=20
    and r.premio_vence_en>now() and r.premio_usado_en is null
    and (r.premio_referencia is null or r.premio_referencia=p_referencia);
  return found;
end; $$;
revoke all on function public.cupissa_referral_reserve(uuid,text) from public,anon,authenticated;
grant execute on function public.cupissa_referral_reserve(uuid,text) to service_role;

create or replace function public.cupissa_referral_finalize(p_referencia text)
returns boolean language plpgsql security definer set search_path=public,pg_temp as $$
begin
  update public.cupissa_referidos set premio_usado_en=now()
   where premio_referencia=p_referencia and premio_usado_en is null;
  return found;
end; $$;
revoke all on function public.cupissa_referral_finalize(text) from public,anon,authenticated;
grant execute on function public.cupissa_referral_finalize(text) to service_role;

create or replace function public.cupissa_referral_release(p_referencia text)
returns boolean language plpgsql security definer set search_path=public,pg_temp as $$
begin
  update public.cupissa_referidos set premio_referencia=null
   where premio_referencia=p_referencia and premio_usado_en is null;
  return found;
end; $$;
revoke all on function public.cupissa_referral_release(text) from public,anon,authenticated;
grant execute on function public.cupissa_referral_release(text) to service_role;
