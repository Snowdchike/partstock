import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiGet, apiPost, apiDelete } from '../lib/api';

type Location = { id: string; name: string; parentId: string | null; description: string | null };

export function LocationsPage() {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const [showForm, setShowForm] = useState(false);

  const list = useQuery({
    queryKey: ['locations'],
    queryFn: () => apiGet<Location[]>('/api/locations'),
  });

  const create = useMutation({
    mutationFn: (input: { name: string; parentId?: string; description?: string }) =>
      apiPost<Location>('/api/locations', input),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['locations'] });
      setShowForm(false);
    },
  });

  const del = useMutation({
    mutationFn: (id: string) => apiDelete(`/api/locations/${id}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['locations'] }),
  });

  const items = list.data ?? [];

  return (
    <div className="space-y-8">
      <div className="flex items-baseline justify-between">
        <h1 className="font-serif text-3xl tracking-tight">{t('locations.title')}</h1>
        <button type="button" className="btn-primary" onClick={() => setShowForm(true)}>
          + {t('locations.new')}
        </button>
      </div>

      {items.length === 0 ? (
        <p className="text-muted italic font-serif py-8">{t('locations.title')} — 0</p>
      ) : (
        <table className="table-hairline">
          <thead>
            <tr>
              <th>{t('locations.name')}</th>
              <th>{t('locations.parent')}</th>
              <th>{t('locations.description')}</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {items.map((l) => (
              <tr key={l.id}>
                <td className="font-medium">{l.name}</td>
                <td className="text-muted">
                  {l.parentId ? items.find((p) => p.id === l.parentId)?.name ?? '—' : '—'}
                </td>
                <td className="text-muted">{l.description ?? '—'}</td>
                <td className="text-right">
                  <button
                    type="button"
                    className="btn-danger text-xs"
                    onClick={() => {
                      if (confirm(`Delete ${l.name}?`)) del.mutate(l.id);
                    }}
                  >
                    {t('locations.delete')}
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      {showForm && (
        <LocationForm
          items={items}
          onSubmit={(data) => create.mutate(data)}
          onClose={() => setShowForm(false)}
          busy={create.isPending}
        />
      )}
    </div>
  );
}

function LocationForm({
  items,
  onSubmit,
  onClose,
  busy,
}: {
  items: Location[];
  onSubmit: (d: { name: string; parentId?: string; description?: string }) => void;
  onClose: () => void;
  busy: boolean;
}) {
  const { t } = useTranslation();
  const [name, setName] = useState('');
  const [parentId, setParentId] = useState('');
  const [description, setDescription] = useState('');

  return (
    <div className="fixed inset-0 bg-paper/95 backdrop-blur-sm flex items-start justify-center p-6 z-20">
      <div className="max-w-md w-full pt-8">
        <h2 className="font-serif text-2xl tracking-tight mb-6">{t('locations.new')}</h2>
        <form
          className="space-y-5"
          onSubmit={(e) => {
            e.preventDefault();
            onSubmit({ name, parentId: parentId || undefined, description: description || undefined });
          }}
        >
          <div>
            <label className="label">{t('locations.name')} *</label>
            <input className="input" value={name} onChange={(e) => setName(e.target.value)} required autoFocus />
          </div>
          <div>
            <label className="label">{t('locations.parent')}</label>
            <select className="input" value={parentId} onChange={(e) => setParentId(e.target.value)}>
              <option value="">{t('locations.none')}</option>
              {items.map((i) => (
                <option key={i.id} value={i.id}>
                  {i.name}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="label">{t('locations.description')}</label>
            <input className="input" value={description} onChange={(e) => setDescription(e.target.value)} />
          </div>
          <div className="pt-3 flex items-center gap-4">
            <button type="submit" className="btn-primary" disabled={busy || !name}>
              {busy ? '...' : t('common.save')}
            </button>
            <button type="button" className="text-sm text-muted hover:text-ink" onClick={onClose}>
              {t('common.cancel')}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
