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
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <h1 className="text-xl font-semibold flex-1">{t('locations.title')}</h1>
        <button type="button" className="btn-primary" onClick={() => setShowForm(true)}>
          + {t('locations.new')}
        </button>
      </div>

      {items.length === 0 ? (
        <div className="card text-center text-zinc-500">{t('locations.title')} — 0</div>
      ) : (
        <div className="table-wrap">
          <table className="table">
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
                  <td className="text-zinc-400">
                    {l.parentId ? items.find((p) => p.id === l.parentId)?.name ?? '—' : '—'}
                  </td>
                  <td className="text-zinc-400">{l.description ?? '—'}</td>
                  <td className="text-right">
                    <button
                      type="button"
                      className="text-red-400 hover:text-red-300 text-xs"
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
        </div>
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
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center p-4 z-20">
      <div className="card w-full max-w-md space-y-3">
        <h2 className="font-semibold">{t('locations.new')}</h2>
        <div>
          <label className="label">{t('locations.name')} *</label>
          <input className="input" value={name} onChange={(e) => setName(e.target.value)} required />
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
        <div className="flex gap-2 justify-end">
          <button type="button" className="btn-ghost" onClick={onClose}>{t('common.cancel')}</button>
          <button
            type="button"
            className="btn-primary"
            disabled={busy || !name}
            onClick={() => onSubmit({ name, parentId: parentId || undefined, description: description || undefined })}
          >
            {busy ? '...' : t('common.save')}
          </button>
        </div>
      </div>
    </div>
  );
}
