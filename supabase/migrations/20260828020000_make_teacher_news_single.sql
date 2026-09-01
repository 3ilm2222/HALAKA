-- يحتفظ النظام بآخر خبر لكل معلم فقط؛ تُزال الأخبار الأقدم بطلب صاحب التطبيق.
delete from public.teacher_news as older
using public.teacher_news as newer
where older.teacher_id = newer.teacher_id
  and (older.created_at < newer.created_at or (older.created_at = newer.created_at and older.id < newer.id));

create unique index if not exists teacher_news_one_per_teacher_idx
on public.teacher_news(teacher_id);
