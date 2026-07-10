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

  if (parts.isLoading) return <div className="text-muted">{t('common.loading')}</div>;
  if (parts.error) return <div className="text-warn">{t('common.error')}</div>;
  const items = parts.data?.items ?? [];

  return (
    <div className="space-y-8">
      <div className="flex items-baseline justify-between gap-4">
        <h1 className="font-serif text-3xl tracking-tight">{t('parts.title')}</h1>
        <button type="button" className="btn-primary" onClick={() => setShowForm(true)}>
          + {t('parts.new')}
        </button>
      </div>

      <input
        className="input max-w-md"
        placeholder={t('parts.search')}
        value={q}
        onChange={(e) => setQ(e.target.value)}
      />

      {items.length === 0 ? (
        <p className="text-muted italic font-serif py-8">{t('parts.empty')}</p>
      ) : (
        <table className="table-hairline">
          <thead>
            <tr>
              <th>{t('parts.fields.name')}</th>
              <th>{t('parts.fields.partNumber')}</th>
              <th>{t('parts.fields.manufacturer')}</th>
              <th>{t('parts.fields.footprint')}</th>
              <th className="text-right pr-2">{t('parts.fields.stock')}</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {items.map((p) => (
              <tr key={p.id}>
                <td className="font-medium">{p.name}</td>
                <td className="font-mono text-xs">{p.partNumber}</td>
                <td className="text-muted">{p.manufacturer ?? '—'}</td>
                <td className="font-mono text-xs text-muted">{p.footprint ?? '—'}</td>
                <td className="text-right tabular text-muted pr-2">—</td>
                <td className="text-right">
                  <button
                    type="button"
                    className="btn-danger text-xs"
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
  onSubmit: (data: {
    name: string;
    partNumber: string;
    manufacturer?: string;
    description?: string;
    footprint?: string;
    unit?: string;
  }) => void;
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
    <div className="fixed inset-0 bg-paper/95 backdrop-blur-sm flex items-start justify-center p-6 z-20 overflow-y-auto">
      <div className="max-w-lg w-full pt-8">
        <h2 className="font-serif text-2xl tracking-tight mb-6">{t('parts.new')}</h2>
        <form
          className="space-y-5"
          onSubmit={(e) => {
            e.preventDefault();
            onSubmit({
              name,
              partNumber,
              manufacturer: manufacturer || undefined,
              description: description || undefined,
              footprint: footprint || undefined,
              unit,
            });
          }}
        >
          <div>
            <label className="label">{t('parts.fields.name')} *</label>
            <input className="input" value={name} onChange={(e) => setName(e.target.value)} required autoFocus />
          </div>
          <div>
            <label className="label">{t('parts.fields.partNumber')} *</label>
            <input
              className="input font-mono"
              value={partNumber}
              onChange={(e) => setPartNumber(e.target.value)}
              required
            />
          </div>
          <div className="grid grid-cols-2 gap-6">
            <div>
              <label className="label">{t('parts.fields.manufacturer')}</label>
              <input className="input" value={manufacturer} onChange={(e) => setManufacturer(e.target.value)} />
            </div>
            <div>
              <label className="label">{t('parts.fields.footprint')}</label>
              <input
                className="input font-mono"
                value={footprint}
                onChange={(e) => setFootprint(e.target.value)}
              />
            </div>
          </div>
          <div>
            <label className="label">{t('parts.fields.description')}</label>
            <textarea
              className="input"
              rows={2}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
            />
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
          {error && <div className="text-sm text-warn pt-1">{error}</div>}
          <div className="pt-3 flex items-center gap-4">
            <button type="submit" className="btn-primary" disabled={busy || !name || !partNumber}>
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
