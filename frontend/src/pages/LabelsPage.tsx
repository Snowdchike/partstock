import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiDelete, apiGet, apiPost, AppError } from '../lib/api';

type Part = {
  id: string;
  name: string;
  partNumber: string;
  manufacturer: string | null;
};
type PartList = { items: Part[] };

type Lot = { id: string; code: string; partId: string };

type Label = {
  id: string;
  partId: string;
  lotId: string | null;
  format: 'qr' | 'code128' | string;
  payload: string;
  svg: string;
  createdAt: string;
  part: Part;
  lot: { id: string; code: string } | null;
};

type LabelList = { items: Label[]; total: number };

export function LabelsPage() {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [showCreate, setShowCreate] = useState(false);

  const labels = useQuery({
    queryKey: ['labels'],
    queryFn: () => apiGet<LabelList>('/api/labels', { limit: 200 }),
  });

  const parts = useQuery({
    queryKey: ['parts', 'label-picker'],
    queryFn: () => apiGet<PartList>('/api/parts', { limit: 200 }),
  });

  const create = useMutation({
    mutationFn: (input: {
      partId: string;
      lotId?: string;
      format: 'qr' | 'code128';
      copies: number;
    }) => apiPost<{ items: Label[]; count: number }>('/api/labels', input),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['labels'] });
      setShowCreate(false);
    },
  });

  const del = useMutation({
    mutationFn: (id: string) => apiDelete(`/api/labels/${id}`),
    onSuccess: (_d, id) => {
      qc.invalidateQueries({ queryKey: ['labels'] });
      setSelected((prev) => {
        const next = new Set(prev);
        next.delete(id);
        return next;
      });
    },
  });

  const items = labels.data?.items ?? [];
  const printItems = useMemo(
    () => (selected.size ? items.filter((l) => selected.has(l.id)) : items),
    [items, selected],
  );

  const toggle = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const selectAll = () => setSelected(new Set(items.map((i) => i.id)));
  const clearSel = () => setSelected(new Set());

  const doPrint = () => {
    if (printItems.length === 0) return;
    const html = `<!doctype html>
<html><head><meta charset="utf-8"/><title>${t('labels.printTitle')}</title>
<style>
  @page { margin: 8mm; }
  body { font-family: system-ui, sans-serif; margin: 0; color: #000; background: #fff; }
  .grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(48mm, 1fr)); gap: 4mm; }
  .label { border: 0.2mm solid #ddd; padding: 2mm; page-break-inside: avoid; text-align: center; }
  .label svg { max-width: 100%; height: auto; }
  .meta { font-size: 9px; margin-top: 1mm; word-break: break-all; }
  @media print { .label { border-color: transparent; } }
</style></head><body>
<div class="grid">
${printItems
  .map(
    (l) => `<div class="label">${l.svg}<div class="meta">${escapeHtml(l.part.partNumber)}${
      l.lot ? ' · ' + escapeHtml(l.lot.code) : ''
    }<br/>${escapeHtml(l.part.name)}</div></div>`,
  )
  .join('\n')}
</div>
<script>window.onload=()=>{window.print();};</script>
</body></html>`;
    const w = window.open('', '_blank', 'noopener,noreferrer,width=900,height=700');
    if (!w) return;
    w.document.open();
    w.document.write(html);
    w.document.close();
  };

  if (labels.isLoading) return <div>{t('common.loading')}</div>;
  if (labels.error) return <div className="text-red-400">{t('common.error')}</div>;

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3 flex-wrap">
        <h1 className="text-xl font-semibold flex-1">{t('labels.title')}</h1>
        <button type="button" className="btn-ghost text-xs" onClick={selectAll} disabled={!items.length}>
          {t('labels.selectAll')}
        </button>
        <button type="button" className="btn-ghost text-xs" onClick={clearSel} disabled={!selected.size}>
          {t('labels.clearSelection')}
        </button>
        <button
          type="button"
          className="btn-primary text-xs"
          onClick={doPrint}
          disabled={printItems.length === 0}
        >
          {t('labels.print')} ({printItems.length})
        </button>
        <button type="button" className="btn-primary" onClick={() => setShowCreate(true)}>
          + {t('labels.new')}
        </button>
      </div>

      <p className="text-xs text-zinc-500">{t('labels.hint')}</p>

      {items.length === 0 ? (
        <div className="card text-center text-zinc-500">{t('labels.empty')}</div>
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
          {items.map((l) => (
            <div
              key={l.id}
              className={`card p-3 space-y-2 ${selected.has(l.id) ? 'ring-1 ring-accent/50' : ''}`}
            >
              <label className="flex items-center gap-2 text-xs text-zinc-400">
                <input
                  type="checkbox"
                  checked={selected.has(l.id)}
                  onChange={() => toggle(l.id)}
                />
                <span className="uppercase">{l.format}</span>
              </label>
              <div
                className="bg-white rounded p-2 flex items-center justify-center min-h-[8rem] overflow-hidden"
                dangerouslySetInnerHTML={{ __html: l.svg }}
              />
              <div className="text-xs">
                <div className="font-medium text-zinc-200">{l.part.name}</div>
                <div className="font-mono text-zinc-400">{l.part.partNumber}</div>
                {l.lot && <div className="text-zinc-500">lot: {l.lot.code}</div>}
              </div>
              <button
                type="button"
                className="text-red-400 hover:text-red-300 text-xs"
                onClick={() => {
                  if (confirm(t('labels.confirmDelete'))) del.mutate(l.id);
                }}
              >
                {t('labels.delete')}
              </button>
            </div>
          ))}
        </div>
      )}

      {showCreate && (
        <CreateLabelModal
          parts={parts.data?.items ?? []}
          busy={create.isPending}
          error={create.error instanceof AppError ? create.error.message : null}
          onClose={() => setShowCreate(false)}
          onSubmit={(data) => create.mutate(data)}
        />
      )}
    </div>
  );
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function CreateLabelModal({
  parts,
  onSubmit,
  onClose,
  busy,
  error,
}: {
  parts: Part[];
  onSubmit: (data: {
    partId: string;
    lotId?: string;
    format: 'qr' | 'code128';
    copies: number;
  }) => void;
  onClose: () => void;
  busy: boolean;
  error: string | null;
}) {
  const { t } = useTranslation();
  const [partId, setPartId] = useState(parts[0]?.id ?? '');
  const [lotId, setLotId] = useState('');
  const [format, setFormat] = useState<'qr' | 'code128'>('qr');
  const [copies, setCopies] = useState('1');

  const lots = useQuery({
    queryKey: ['lots', partId],
    enabled: !!partId,
    queryFn: () => apiGet<Lot[]>('/api/lots', { partId }),
  });

  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center p-4 z-20">
      <div className="card w-full max-w-lg space-y-3">
        <h2 className="font-semibold">{t('labels.new')}</h2>
        <div>
          <label className="label">{t('labels.fields.part')} *</label>
          <select
            className="input"
            value={partId}
            onChange={(e) => {
              setPartId(e.target.value);
              setLotId('');
            }}
          >
            {parts.length === 0 && <option value="">{t('labels.noParts')}</option>}
            {parts.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name} · {p.partNumber}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="label">{t('labels.fields.lot')}</label>
          <select className="input" value={lotId} onChange={(e) => setLotId(e.target.value)}>
            <option value="">{t('labels.noLot')}</option>
            {(lots.data ?? []).map((l) => (
              <option key={l.id} value={l.id}>
                {l.code}
              </option>
            ))}
          </select>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="label">{t('labels.fields.format')}</label>
            <select
              className="input"
              value={format}
              onChange={(e) => setFormat(e.target.value as 'qr' | 'code128')}
            >
              <option value="qr">QR</option>
              <option value="code128">Code 128</option>
            </select>
          </div>
          <div>
            <label className="label">{t('labels.fields.copies')}</label>
            <input
              className="input"
              type="number"
              min={1}
              max={50}
              value={copies}
              onChange={(e) => setCopies(e.target.value)}
            />
          </div>
        </div>
        {error && <div className="text-red-400 text-sm">{error}</div>}
        <div className="flex gap-2 justify-end">
          <button type="button" className="btn-ghost" onClick={onClose}>
            {t('common.cancel')}
          </button>
          <button
            type="button"
            className="btn-primary"
            disabled={busy || !partId || !(Number(copies) >= 1)}
            onClick={() =>
              onSubmit({
                partId,
                lotId: lotId || undefined,
                format,
                copies: Math.min(50, Math.max(1, Number(copies) || 1)),
              })
            }
          >
            {busy ? '...' : t('common.save')}
          </button>
        </div>
      </div>
    </div>
  );
}
