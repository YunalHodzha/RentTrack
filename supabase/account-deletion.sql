-- RentTrack — изтриване на акаунт от приложението
-- =====================================================================
-- Изпълни ръчно в Supabase SQL Editor (както schema.sql), еднократно.
--
-- Защо съществува: Apple изисква приложения с регистрация да предлагат
-- изтриване на акаунта от самото приложение; GDPR чл. 17 дава право на
-- изтриване. Клиентът вика функцията през supabase.rpc('delete_my_account').
--
-- Дизайн:
--  * SECURITY DEFINER — функцията тече с правата на собственика си (postgres),
--    защото authenticated ролята няма (и не бива да има) DELETE върху таблиците
--    (клиентът ползва само soft delete) нито достъп до auth.users.
--  * Изтриването тук е ТВЪРДО, не soft — GDPR изисква реално заличаване.
--  * Ред на изтриване child-first по FK веригата:
--    payments -> leases -> tenants/properties -> auth.users.
--    (FK-ите са с ON DELETE CASCADE, така че редът е защита в дълбочина,
--    не строго необходим.)
--  * Изпълнима само от authenticated; auth.uid() гарантира, че потребителят
--    може да изтрие единствено собствения си акаунт.
-- =====================================================================

create or replace function public.delete_my_account()
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid uuid := auth.uid();
begin
  if uid is null then
    raise exception 'delete_my_account: не е намерена автентикирана сесия';
  end if;

  delete from public.payments   where user_id = uid;
  delete from public.leases     where user_id = uid;
  delete from public.tenants    where user_id = uid;
  delete from public.properties where user_id = uid;

  -- Самият акаунт — след данните, за да не остане осиротял потребител при
  -- частичен провал (всичко е в една транзакция на функцията така или иначе).
  delete from auth.users where id = uid;
end;
$$;

-- По подразбиране Postgres дава EXECUTE на public — отнемаме го изрично и
-- разрешаваме само на влезли потребители.
revoke execute on function public.delete_my_account() from public, anon;
grant execute on function public.delete_my_account() to authenticated;
