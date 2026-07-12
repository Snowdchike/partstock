import { useState } from 'react';
import { Link, useParams } from '@tanstack/react-router';
import { useTranslation } from 'react-i18next';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiDelete, apiGet, apiPatch, apiPost, AppError } from '../lib/api';

type Tag = { id: string; name: string; color: string | null };
type Category = { id: string; name: string };
type Lot = { id: string; code: string; notes: string | null; receivedAt: string };
type StockLine = {
  id: string;
  quantity: number;
  reservedQuantity: number;
  location: { id: string; name: string };
  lot: { id: string; code: string } | null;
};

type PartDetail = {
  id: string;
  name: string;
  partNumber: string;
  manufacturer: string | null;
  description: string | null;
  footprint: string | null;
  unit: string;
  notes: string | null;
  categoryId: string | null;
  category?: Category | null;
  tags?: Tag[];
  lots: Lot[];
  stockItems: StockLine[];
};

type StockSummary = {
  total: number;
  reserved: number;
  available: number;
};

export function PartDetailPage() {
  const { t } = useTranslation();
  const { partId } = useParams({ strict: false }) as { partId: string };
  const qc = useQueryClient();
  const [edit, setEdit] = useState(false);
  const [showLot, setShowLot] = useState(false);

  const partQ = useQuery({
    queryKey: ['part', partId],
    queryFn: () => apiGet<PartDetail>(`/api/parts/${partId}`),
  });
  const summaryQ = useQuery({
    queryKey: ['stock-summary', partId],
    queryFn: () => apiGet<StockSummary>(`/api/stock/summary/${partId}`),
  });
  const cats = useQuery({
    queryKey: ['categories'],
    queryFn: () => apiGet<Category[]>('/api/categories'),
  });
  const tags = useQuery({
    queryKey: ['tags'],
    queryFn: () => apiGet<Tag[]>('/api/tags'),
  });

  const save = useMutation({
    mutationFn: (body: Record<string, unknown>) => apiPatch<PartDetail>(`/api/parts/${partId}`, body),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['part', partId] });
      qc.invalidateQueries({ queryKey: ['parts'] });
      setEdit(false);
    },
  });

  const addLot = useMutation({
    mutationFn: (input: { code: string; notes?: string }) =>
      apiPost('/api/lots', { partId, code: input.code, notes: input.notes }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['part', partId] });
      setShowLot(false);
    },
  });

  const delLot = useMutation({
    mutationFn: (id: string) => apiDelete(`/api/lots/${id}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['part', partId] }),
  });

  if (partQ.isLoading) return <div>{t('common.loading')}</div>;
  if (partQ.error || !partQ.data) {
    return (
      <div className="space-y-3">
        <div className="text-red-400">{t('common.error')}</div>
        <Link to="/parts" className="text-accent text-sm">
          ← {t('parts.title')}
        </Link>
      </div>
    );
  }

  const p = partQ.data;
  const sum = summaryQ.data;

  return (
    <div className="space-y-6">
      <div className="flex items-start gap-3 flex-wrap">
        <div className="flex-1 min-w-[12rem]">
          <Link to="/parts" className="text-xs text-zinc-500 hover:text-zinc-300">
            ← {t('parts.title')}
          </Link>
          <h1 className="text-xl font-semibold mt-1">{p.name}</h1>
          <p className="font-mono text-sm text-zinc-400">{p.partNumber}</p>
        </div>
        <button type="button" className="btn-ghost text-xs" onClick={() => setEdit((v) => !v)}>
          {edit ? t('common.cancel') : t('parts.edit')}
        </button>
      </div>

      {edit ? (
        <EditForm
          part={p}
          categories={cats.data ?? []}
          tags={tags.data ?? []}
          busy={save.isPending}
          error={save.error instanceof AppError ? save.error.message : null}
          onSave={(body) => save.mutate(body)}
        />
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="card space-y-2 text-sm">
            <Row label={t('parts.fields.manufacturer')} value={p.manufacturer} />
            <Row label={t('parts.fields.footprint')} value={p.footprint} mono />
            <Row label={t('parts.fields.unit')} value={p.unit} />
            <Row label={t('parts.fields.category')} value={p.category?.name} />
            <Row
              label={t('parts.fields.tags')}
              value={(p.tags ?? []).map((x) => x.name).join(', ') || null}
            />
            <Row label={t('parts.fields.description')} value={p.description} />
            <Row label={t('parts.fields.notes')} value={p.notes} />
          </div>
          <div className="card space-y-2 text-sm">
            <h2 className="font-semibold text-base">{t('stock.title')}</h2>
            {summaryQ.isLoading ? (
              <div>{t('common.loading')}</div>
            ) : (
              <>
                <Row label={t('stock.total')} value={sum ? `${sum.total} ${p.unit}` : '0'} />
                <Row label={t('stock.reserved')} value={sum ? String(sum.reserved) : '0'} />
                <Row label={t('stock.available')} value={sum ? String(sum.available) : '0'} />
              </>
            )}
            {(p.stockItems ?? []).length > 0 && (
              <ul className="mt-2 space-y-1 text-xs border-t border-border pt-2">
                {p.stockItems.map((s) => (
                  <li key={s.id}>
                    <span className="text-zinc-400">{s.location.name}</span>
                    {s.lot && <span className="ml-2 text-zinc-500">[{s.lot.code}]</span>}
                    <span className="ml-2 font-mono"> {s.quantity}</span>
                  </li>
                ))}
              </ul>
            )}
            <Link to="/stock" className="text-accent text-xs inline-block mt-2">
              {t('stock.adjust')} →
            </Link>
          </div>
        </div>
      )}

      <section className="space-y-3">
        <div className="flex items-center gap-3">
          <h2 className="font-semibold flex-1">{t('lots.title')}</h2>
          <button type="button" className="btn-primary text-xs" onClick={() => setShowLot(true)}>
            + {t('lots.new')}
          </button>
        </div>
        {p.lots.length === 0 ? (
          <div className="card text-center text-zinc-500 text-sm">{t('lots.empty')}</div>
        ) : (
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr>
                  <th>{t('lots.code')}</th>
                  <th>{t('lots.receivedAt')}</th>
                  <th>{t('lots.notes')}</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {p.lots.map((l) => (
                  <tr key={l.id}>
                    <td className="font-mono text-xs">{l.code}</td>
                    <td className="text-xs text-zinc-400">
                      {l.receivedAt ? new Date(l.receivedAt).toLocaleDateString() : '—'}
                    </td>
                    <td className="text-sm">{l.notes ?? '—'}</td>
                    <td className="text-right">
                      <button
                        type="button"
                        className="text-red-400 text-xs"
                        onClick={() => {
                          if (confirm(t('lots.confirmDelete'))) delLot.mutate(l.id);
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
        {delLot.error instanceof AppError && (
          <div className="text-red-400 text-sm">{delLot.error.message}</div>
        )}
      </section>

      {showLot && (
        <LotModal
          busy={addLot.isPending}
          error={addLot.error instanceof AppError ? addLot.error.message : null}
          onClose={() => setShowLot(false)}
          onSubmit={(d) => addLot.mutate(d)}
        />
      )}
    </div>
  );
}

function Row({
  label,
  value,
  mono,
}: {
  label: string;
  value: string | null | undefined;
  mono?: boolean;
}) {
  return (
    <div className="flex gap-2">
      <span className="text-zinc-500 w-28 shrink-0">{label}</span>
      <span className={mono ? 'font-mono text-xs' : ''}>{value || '—'}</span>
    </div>
  );
}

function EditForm({
  part,
  categories,
  tags,
  onSave,
  busy,
  error,
}: {
  part: PartDetail;
  categories: Category[];
  tags: Tag[];
  onSave: (body: Record<string, unknown>) => void;
  busy: boolean;
  error: string | null;
}) {
  const { t } = useTranslation();
  const [name, setName] = useState(part.name);
  const [partNumber, setPartNumber] = useState(part.partNumber);
  const [manufacturer, setManufacturer] = useState(part.manufacturer ?? '');
  const [footprint, setFootprint] = useState(part.footprint ?? '');
  const [description, setDescription] = useState(part.description ?? '');
  const [notes, setNotes] = useState(part.notes ?? '');
  const [unit, setUnit] = useState(part.unit);
  const [categoryId, setCategoryId] = useState(part.categoryId ?? '');
  const [tagIds, setTagIds] = useState((part.tags ?? []).map((x) => x.id));

  const toggleTag = (id: string) => {
    setTagIds((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  };

  return (
    <div className="card space-y-3 max-w-xl">
      <div>
        <label className="label">{t('parts.fields.name')}</label>
        <input className="input" value={name} onChange={(e) => setName(e.target.value)} />
      </div>
      <div>
        <label className="label">{t('parts.fields.partNumber')}</label>
        <input className="input font-mono" value={partNumber} onChange={(e) => setPartNumber(e.target.value)} />
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
        <label className="label">{t('parts.fields.category')}</label>
        <select className="input" value={categoryId} onChange={(e) => setCategoryId(e.target.value)}>
          <option value="">{t('parts.noCategory')}</option>
          {categories.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>
      </div>
      <div>
        <label className="label">{t('parts.fields.tags')}</label>
        <div className="flex flex-wrap gap-2 mt-1">
          {tags.map((tg) => (
            <label key={tg.id} className="flex items-center gap-1 text-sm card py-1 px-2 cursor-pointer">
              <input type="checkbox" checked={tagIds.includes(tg.id)} onChange={() => toggleTag(tg.id)} />
              {tg.name}
            </label>
          ))}
        </div>
      </div>
      <div>
        <label className="label">{t('parts.fields.description')}</label>
        <textarea className="input" rows={2} value={description} onChange={(e) => setDescription(e.target.value)} />
      </div>
      <div>
        <label className="label">{t('parts.fields.notes')}</label>
        <textarea className="input" rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} />
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
      <button
        type="button"
        className="btn-primary"
        disabled={busy || !name.trim() || !partNumber.trim()}
        onClick={() =>
          onSave({
            name: name.trim(),
            partNumber: partNumber.trim(),
            manufacturer: manufacturer || null,
            footprint: footprint || null,
            description: description || null,
            notes: notes || null,
            unit,
            categoryId: categoryId || null,
            tagIds,
          })
        }
      >
        {busy ? '...' : t('common.save')}
      </button>
    </div>
  );
}

function LotModal({
  onSubmit,
  onClose,
  busy,
  error,
}: {
  onSubmit: (d: { code: string; notes?: string }) => void;
  onClose: () => void;
  busy: boolean;
  error: string | null;
}) {
  const { t } = useTranslation();
  const [code, setCode] = useState('');
  const [notes, setNotes] = useState('');
  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center p-4 z-20">
      <div className="card w-full max-w-md space-y-3">
        <h2 className="font-semibold">{t('lots.new')}</h2>
        <div>
          <label className="label">{t('lots.code')} *</label>
          <input className="input font-mono" value={code} onChange={(e) => setCode(e.target.value)} />
        </div>
        <div>
          <label className="label">{t('lots.notes')}</label>
          <input className="input" value={notes} onChange={(e) => setNotes(e.target.value)} />
        </div>
        {error && <div className="text-red-400 text-sm">{error}</div>}
        <div className="flex gap-2 justify-end">
          <button type="button" className="btn-ghost" onClick={onClose}>
            {t('common.cancel')}
          </button>
          <button
            type="button"
            className="btn-primary"
            disabled={busy || !code.trim()}
            onClick={() => onSubmit({ code: code.trim(), notes: notes.trim() || undefined })}
          >
            {busy ? '...' : t('common.save')}
          </button>
        </div>
      </div>
    </div>
  );
}
