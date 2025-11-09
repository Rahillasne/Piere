-- Images
CREATE POLICY "Give users access to own folder images_select" ON storage.objects FOR SELECT TO public USING (bucket_id = 'images' AND (select auth.uid()::text) = (storage.foldername(name))[1]);

CREATE POLICY "Give users access to own folder images_insert" ON storage.objects FOR INSERT TO public WITH CHECK (bucket_id = 'images' AND (select auth.uid()::text) = (storage.foldername(name))[1]);

CREATE POLICY "Give users access to own folder images_update" ON storage.objects FOR UPDATE TO public USING (bucket_id = 'images' AND (select auth.uid()::text) = (storage.foldername(name))[1]);

CREATE POLICY "Give users access to own folder images_delete" ON storage.objects FOR DELETE TO public USING (bucket_id = 'images' AND (select auth.uid()::text) = (storage.foldername(name))[1]);
