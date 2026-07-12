import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiDelete, apiGet, apiPost, AppError } from '../lib/api';

type Category = {
  id: string;
  name: string;
  parentId: string | null;
  description: string | null;
  _count?: { parts: number; children: number };
};

type Tag = {
  id: string;
  name: string;
  color: string | null;
  _count?: { partTags: number };
};

export function CategoriesPage() {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const [showCat, setShowCat] = useState(false);
  const [showTag, setShowTag] = useState(false);

  const cats = useQuery({
    queryKey: ['categories'],
    queryFn: () => apiGet<Category[]>('/api/categories'),
  });
  const tags = useQuery({
    queryKey: ['tags'],
    queryFn: () => apiGet<Tag[]>('/api/tags'),
  });

  const createCat = useMutation({
    mutationFn: (input: { name: string; parentId?: string; description?: string }) =>
      apiPost<Category>('/api/categories', input),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['categories'] });
      setShowCat(false);
    },
  });
  const delCat = useMutation({
    mutationFn: (id: string) => apiDelete(`/api/categories/${id}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['categories'] }),
  });

  const createTag = useMutation({
    mutationFn: (input: { name: string; color?: string }) => apiPost<Tag>('/api/tags', input),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['tags'] });
      setShowTag(false);
    },
  });
  const delTag = useMutation({
    mutationFn: (id: string) => apiDelete(`/api/tags/${id}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['tags'] }),
  });

  if (cats.isLoading || tags.isLoading) return <div>{t('common.loading')}</div>;
  if (cats.error || tags.error) return <div className="text-red-400">{t('common.error')}</div>;

  const catList = cats.data ?? [];
  const tagList = tags.data ?? [];
  const nameOf = (id: string | null) => catList.find((c) => c.id === id)?.name ?? '—';

  return (
    <div className="space-y-8">
      <section className="space-y-3">
        <div className="flex items-center gap-3">
          <h1 className="text-xl font-semibold flex-1">{t('categories.title')}</h1>
          <button type="button" className="btn-primary" onClick={() => setShowCat(true)}>
            + {t('categories.new')}
          </button>
        </div>
        {catList.length === 0 ? (
          <div className="card text-center text-zinc-500">{t('categories.empty')}</div>
        ) : (
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr>
                  <th>{t('categories.fields.name')}</th>
                  <th>{t('categories.fields.parent')}</th>
                  <th className="text-right">{t('categories.fields.parts')}</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {catList.map((c) => (
                  <tr key={c.id}>
                    <td className="font-medium">{c.name}</td>
                    <td className="text-zinc-400 text-sm">{nameOf(c.parentId)}</td>
                    <td className="text-right">{c._count?.parts ?? 0}</td>
                    <td className="text-right">
                      <button
                        type="button"
                        className="text-red-400 hover:text-red-300 text-xs"
                        onClick={() => {
                          if (confirm(t('categories.confirmDelete'))) delCat.mutate(c.id);
                        }}
                      >
                        {t('common.delete')}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {delCat.error instanceof AppError && (
          <div className="text-red-400 text-sm">{delCat.error.message}</div>
        )}
      </section>

      <section className="space-y-3">
        <div className="flex items-center gap-3">
          <h2 className="text-lg font-semibold flex-1">{t('tags.title')}</h2>
          <button type="button" className="btn-primary" onClick={() => setShowTag(true)}>
            + {t('tags.new')}
          </button>
        </div>
        {tagList.length === 0 ? (
          <div className="card text-center text-zinc-500">{t('tags.empty')}</div>
        ) : (
          <div className="flex flex-wrap gap-2">
            {tagList.map((tag) => (
              <div
                key={tag.id}
                className="card py-2 px-3 flex items-center gap-2 text-sm"
              >
                <span
                  className="inline-block w-3 h-3 rounded-full"
                  style={{ background: tag.color || '#71717a' }}
                />
                <span className="font-medium">{tag.name}</span>
                <span className="text-zinc-500 text-xs">×{tag._count?.partTags ?? 0}</span>
                <button
                  type="button"
                  className="text-red-400 text-xs ml-1"
                  onClick={() => {
                    if (confirm(t('tags.confirmDelete'))) delTag.mutate(tag.id);
                  }}
                >
                  ×
                </button>
              </div>
            ))}
          </div>
        )}
      </section>

      {showCat && (
        <Modal
          title={t('categories.new')}
          busy={createCat.isPending}
          error={createCat.error instanceof AppError ? createCat.error.message : null}
          onClose={() => setShowCat(false)}
        >
          <CatForm
            parents={catList}
            busy={createCat.isPending}
            onSubmit={(data) => createCat.mutate(data)}
          />
        </Modal>
      )}
      {showTag && (
        <Modal
          title={t('tags.new')}
          busy={createTag.isPending}
          error={createTag.error instanceof AppError ? createTag.error.message : null}
          onClose={() => setShowTag(false)}
        >
          <TagForm busy={createTag.isPending} onSubmit={(data) => createTag.mutate(data)} />
        </Modal>
      )}
    </div>
  );
}

function Modal({
  title,
  children,
  onClose,
  error,
}: {
  title: string;
  children: React.ReactNode;
  busy: boolean;
  error: string | null;
  onClose: () => void;
}) {
  const { t } = useTranslation();
  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center p-4 z-20">
      <div className="card w-full max-w-md space-y-3">
        <div className="flex items-center gap-2">
          <h2 className="font-semibold flex-1">{title}</h2>
          <button type="button" className="btn-ghost text-xs" onClick={onClose}>
            {t('common.close')}
          </button>
        </div>
        {error && <div className="text-red-400 text-sm">{error}</div>}
        {children}
      </div>
    </div>
  );
}

function CatForm({
  parents,
  onSubmit,
  busy,
}: {
  parents: Category[];
  onSubmit: (d: { name: string; parentId?: string; description?: string }) => void;
  busy: boolean;
}) {
  const { t } = useTranslation();
  const [name, setName] = useState('');
  const [parentId, setParentId] = useState('');
  const [description, setDescription] = useState('');
  return (
    <div className="space-y-3">
      <div>
        <label className="label">{t('categories.fields.name')} *</label>
        <input className="input" value={name} onChange={(e) => setName(e.target.value)} />
      </div>
      <div>
        <label className="label">{t('categories.fields.parent')}</label>
        <select className="input" value={parentId} onChange={(e) => setParentId(e.target.value)}>
          <option value="">{t('categories.none')}</option>
          {parents.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
            </option>
          ))}
        </select>
      </div>
      <div>
        <label className="label">{t('categories.fields.description')}</label>
        <input className="input" value={description} onChange={(e) => setDescription(e.target.value)} />
      </div>
      <button
        type="button"
        className="btn-primary w-full"
        disabled={busy || !name.trim()}
        onClick={() =>
          onSubmit({
            name: name.trim(),
            parentId: parentId || undefined,
            description: description.trim() || undefined,
          })
        }
      >
        {busy ? '...' : t('common.save')}
      </button>
    </div>
  );
}

function TagForm({
  onSubmit,
  busy,
}: {
  onSubmit: (d: { name: string; color?: string }) => void;
  busy: boolean;
}) {
  const { t } = useTranslation();
  const [name, setName] = useState('');
  const [color, setColor] = useState('3366ff');
  return (
    <div className="space-y-3">
      <div>
        <label className="label">{t('tags.fields.name')} *</label>
        <input className="input" value={name} onChange={(e) => setName(e.target.value)} />
      </div>
      <div>
        <label className="label">{t('tags.fields.color')}</label>
        <input className="input font-mono" value={color} onChange={(e) => setColor(e.target.value)} />
      </div>
      <button
        type="button"
        className="btn-primary w-full"
        disabled={busy || !name.trim()}
        onClick={() => onSubmit({ name: name.trim(), color: color || undefined })}
      >
        {busy ? '...' : t('common.save')}
      </button>
    </div>
  );
}
