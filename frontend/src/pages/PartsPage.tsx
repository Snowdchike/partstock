import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiGet, apiPost, apiDelete, AppError } from '../lib/api';

type Part = {
  id: string;
  name: string;
  partNumber: string;
  manufacturer: string | null;
  description: string | null;
  footprint: string | null;
  unit: string;
  notes: string | null;
};

type List = { items: Part[]; total: number };

export function PartsPage() {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const [q, setQ] = useState('');
  const [showForm, setShowForm] = useState(false);

  const parts = useQuery({
    queryKey: ['parts', q],
    queryFn: () => apiGet<List>('/api/parts', { q: q || undefined, limit: 200 }),
  });

  const create = useMutation({
    mutationFn: (input: Partial<Part> & { name: string; partNumber: string }) =>
      apiPost<Part>('/api/parts', input),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['parts'] });
      setShowForm(false);
    },
  });

  const del = useMutation({
    mutationFn: (id: string) => apiDelete(`/api/parts/${id}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['parts'] }),
  });

  if (parts.isLoading) return <div>{t('common.loading')}</div>;
  if (parts.error) return <div className="text-red-400">{t('common.error')}</div>;
  const items = parts.data?.items ?? [];

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <h1 className="text-xl font-semibold flex-1">{t('parts.title')}</h1>
        <button type="button" className="btn-primary" onClick={() => setShowForm(true)}>
          + {t('parts.new')}
        </button>
      </div>

      <input
        className="input"
        placeholder={t('parts.search')}
        value={q}
        onChange={(e) => setQ(e.target.value)}
      />

      {items.length === 0 ? (
        <div className="card text-center text-zinc-500">{t('parts.empty')}</div>
      ) : (
        <div className="table-wrap">
          <table className="table">
            <thead>
              <tr>
                <th>{t('parts.fields.name')}</th>
                <th>{t('parts.fields.partNumber')}</th>
                <th>{t('parts.fields.manufacturer')}</th>
                <th>{t('parts.fields.footprint')}</th>
                <th className="text-right">{t('parts.fields.stock')}</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {items.map((p) => (
                <tr key={p.id}>
                  <td className="font-medium">{p.name}</td>
                  <td className="font-mono text-xs">{p.partNumber}</td>
                  <td>{p.manufacturer ?? '—'}</td>
                  <td className="font-mono text-xs">{p.footprint ?? '—'}</td>
                  <td className="text-right">—</td>
                  <td className="text-right">
                    <button
                      type="button"
                      className="text-red-400 hover:text-red-300 text-xs"
                      onClick={() => {
                        if (confirm(`Delete ${p.name}?`)) del.mutate(p.id);
                      }}
                    >
                      {t('parts.delete')}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {showForm && (
        <PartForm
          onSubmit={(data) => create.mutate(data)}
          onClose={() => setShowForm(false)}
          busy={create.isPending}
          error={create.error instanceof AppError ? create.error.message : null}
        />
      )}
    </div>
  );
}

function PartForm({
  onSubmit,
  onClose,
  busy,
  error,
}: {
  onSubmit: (data: { name: string; partNumber: string; manufacturer?: string; description?: string; footprint?: string; unit?: string }) => void;
  onClose: () => void;
  busy: boolean;
  error: string | null;
}) {
  const { t } = useTranslation();
  const [name, setName] = useState('');
  const [partNumber, setPartNumber] = useState('');
  const [manufacturer, setManufacturer] = useState('');
  const [description, setDescription] = useState('');
  const [footprint, setFootprint] = useState('');
  const [unit, setUnit] = useState('pcs');

  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center p-4 z-20">
      <div className="card w-full max-w-lg space-y-3">
        <h2 className="font-semibold">{t('parts.new')}</h2>
        <div>
          <label className="label">{t('parts.fields.name')} *</label>
          <input className="input" value={name} onChange={(e) => setName(e.target.value)} required />
        </div>
        <div>
          <label className="label">{t('parts.fields.partNumber')} *</label>
          <input className="input font-mono" value={partNumber} onChange={(e) => setPartNumber(e.target.value)} required />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="label">{t('parts.fields.manufacturer')}</label>
            <input className="input" value={manufacturer} onChange={(e) => setManufacturer(e.target.value)} />
          </div>
          <div>
            <label className="label">{t('parts.fields.footprint')}</label>
            <input className="input font-mono" value={footprint} onChange={(e) => setFootprint(e.target.value)} />
          </div>
        </div>
        <div>
          <label className="label">{t('parts.fields.description')}</label>
          <textarea className="input" rows={2} value={description} onChange={(e) => setDescription(e.target.value)} />
        </div>
        <div>
          <label className="label">{t('parts.fields.unit')}</label>
          <select className="input" value={unit} onChange={(e) => setUnit(e.target.value)}>
            <option value="pcs">pcs</option>
            <option value="m">m</option>
            <option value="g">g</option>
            <option value="m2">m²</option>
          </select>
        </div>
        {error && <div className="text-red-400 text-sm">{error}</div>}
        <div className="flex gap-2 justify-end">
          <button type="button" className="btn-ghost" onClick={onClose}>{t('common.cancel')}</button>
          <button
            type="button"
            className="btn-primary"
            disabled={busy || !name || !partNumber}
            onClick={() => onSubmit({ name, partNumber, manufacturer: manufacturer || undefined, description: description || undefined, footprint: footprint || undefined, unit })}
          >
            {busy ? '...' : t('common.save')}
          </button>
        </div>
      </div>
    </div>
  );
}
