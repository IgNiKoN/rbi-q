-- P2-0043: одно имя файла старого бакета для проверки ссылки (ТОЛЬКО ЧТЕНИЕ)
select bucket_id, name from storage.objects where bucket_id in ('inspection-photos','reports') order by created_at desc limit 2;
