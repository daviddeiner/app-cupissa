-- Cupissa: corregir la vinculación de pedidos existentes al cancelar.
-- Ejecutar una sola vez en Supabase > SQL Editor (sin reejecutar toda la migración).
-- Solo permite cancelar pedidos propios aún agendados / pendientes.
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
            or (nullif(to_jsonb(c)->>'cliente_id','') is not null
              and to_jsonb(c)->>'cliente_id'=to_jsonb(p)->>'cliente_id')
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
