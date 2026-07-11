import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiDelete, apiGet, apiPatch, apiPost, AppError } from '../lib/api';

type Part = {
  id: string;
  name: string;
  partNumber: string;
  manufacturer: string | null;
};

type BomListItem = {
  id: string;
  name: string;
  version: string;
  notes: string | null;
  lineCount: number;
  updatedAt: string;
};

type BomLine = {
  id: string;
  partId: string;
  quantity: number;
  designator: string | null;
  part: Part;
};

type BomDetail = {
  id: string;
  name: string;
  version: string;
  notes: string | null;
  lines: BomLine[];
};

type BomList = { items: BomListItem[]; total: number };
type PartList = { items: Part[]; total: number };

export function BomsPage() {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const [q, setQ] = useState('');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [showCreate, setShowCreate] = useState(false);
  const [showImport, setShowImport] = useState(false);
  const [showAddLine, setShowAddLine] = useState(false);

  const list = useQuery({
    queryKey: ['boms', q],
    queryFn: () => apiGet<BomList>('/api/boms', { q: q || undefined, limit: 200 }),
  });

  const detail = useQuery({
    queryKey: ['bom', selectedId],
    enabled: !!selectedId,
    queryFn: () => apiGet<BomDetail>(`/api/boms/${selectedId}`),
  });

  const parts = useQuery({
    queryKey: ['parts', 'bom-picker'],
    queryFn: () => apiGet<PartList>('/api/parts', { limit: 200 }),
  });

  const createBom = useMutation({
    mutationFn: (input: { name: string; version: string; notes?: string }) =>
      apiPost<BomDetail>('/api/boms', input),
    onSuccess: (bom) => {
      qc.invalidateQueries({ queryKey: ['boms'] });
      setShowCreate(false);
      setSelectedId(bom.id);
    },
  });

  const deleteBom = useMutation({
    mutationFn: (id: string) => apiDelete(`/api/boms/${id}`),
    onSuccess: (_d, id) => {
      qc.invalidateQueries({ queryKey: ['boms'] });
      if (selectedId === id) setSelectedId(null);
    },
  });

  const addLine = useMutation({
    mutationFn: (input: { partId: string; quantity: number; designator?: string }) =>
      apiPost(`/api/boms/${selectedId}/lines`, input),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['bom', selectedId] });
      qc.invalidateQueries({ queryKey: ['boms'] });
      setShowAddLine(false);
    },
  });

  const patchLine = useMutation({
    mutationFn: (input: { lineId: string; quantity: number; designator?: string | null }) =>
      apiPatch(`/api/boms/${selectedId}/lines/${input.lineId}`, {
        quantity: input.quantity,
        designator: input.designator,
      }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['bom', selectedId] }),
  });

  const deleteLine = useMutation({
    mutationFn: (lineId: string) => apiDelete(`/api/boms/${selectedId}/lines/${lineId}`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['bom', selectedId] });
      qc.invalidateQueries({ queryKey: ['boms'] });
    },
  });

  const importCsv = useMutation({
    mutationFn: (input: { csv: string; createMissingParts: boolean; replaceLines: boolean }) =>
      apiPost(`/api/boms/${selectedId}/import-csv`, input),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['bom', selectedId] });
      qc.invalidateQueries({ queryKey: ['boms'] });
      qc.invalidateQueries({ queryKey: ['parts'] });
      setShowImport(false);
    },
  });

  const items = list.data?.items ?? [];
  const bom = detail.data;
  const partOptions = useMemo(() => parts.data?.items ?? [], [parts.data]);

  if (list.isLoading) return <div>{t('common.loading')}</div>;
  if (list.error) return <div className="text-red-400">{t('common.error')}</div>;

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <h1 className="text-xl font-semibold flex-1">{t('boms.title')}</h1>
        <button type="button" className="btn-primary" onClick={() => setShowCreate(true)}>
          + {t('boms.new')}
        </button>
      </div>

      <input
        className="input"
        placeholder={t('boms.search')}
        value={q}
        onChange={(e) => setQ(e.target.value)}
      />

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <div className="lg:col-span-1 space-y-2">
          {items.length === 0 ? (
            <div className="card text-center text-zinc-500">{t('boms.empty')}</div>
          ) : (
            items.map((b) => (
              <button
                key={b.id}
                type="button"
                onClick={() => setSelectedId(b.id)}
                className={`w-full text-left card py-3 px-4 transition ${
                  selectedId === b.id ? 'ring-1 ring-accent/50 bg-accent/5' : 'hover:bg-surface'
                }`}
              >
                <div className="font-medium">{b.name}</div>
                <div className="text-xs text-zinc-500 mt-1">
                  {t('boms.version')}: {b.version} · {b.lineCount} {t('boms.lines')}
                </div>
              </button>
            ))
          )}
        </div>

        <div className="lg:col-span-2">
          {!selectedId ? (
            <div className="card text-center text-zinc-500">{t('boms.pick')}</div>
          ) : detail.isLoading ? (
            <div>{t('common.loading')}</div>
          ) : detail.error || !bom ? (
            <div className="text-red-400">{t('common.error')}</div>
          ) : (
            <div className="space-y-4">
              <div className="card space-y-2">
                <div className="flex items-start gap-3">
                  <div className="flex-1">
                    <h2 className="text-lg font-semibold">{bom.name}</h2>
                    <p className="text-sm text-zinc-400">
                      {t('boms.version')} {bom.version}
                      {bom.notes ? ` · ${bom.notes}` : ''}
                    </p>
                  </div>
                  <button
                    type="button"
                    className="btn-ghost text-xs"
                    onClick={() => setShowAddLine(true)}
                  >
                    + {t('boms.addLine')}
                  </button>
                  <button
                    type="button"
                    className="btn-ghost text-xs"
                    onClick={() => setShowImport(true)}
                  >
                    {t('boms.importCsv')}
                  </button>
                  <button
                    type="button"
                    className="text-red-400 hover:text-red-300 text-xs"
                    onClick={() => {
                      if (confirm(t('boms.confirmDelete'))) deleteBom.mutate(bom.id);
                    }}
                  >
                    {t('boms.delete')}
                  </button>
                </div>
              </div>

              {bom.lines.length === 0 ? (
                <div className="card text-center text-zinc-500">{t('boms.noLines')}</div>
              ) : (
                <div className="table-wrap">
                  <table className="table">
                    <thead>
                      <tr>
                        <th>{t('boms.fields.designator')}</th>
                        <th>{t('parts.fields.name')}</th>
                        <th>{t('parts.fields.partNumber')}</th>
                        <th>{t('parts.fields.manufacturer')}</th>
                        <th className="text-right">{t('boms.fields.quantity')}</th>
                        <th></th>
                      </tr>
                    </thead>
                    <tbody>
                      {bom.lines.map((line) => (
                        <tr key={line.id}>
                          <td className="font-mono text-xs">{line.designator ?? '—'}</td>
                          <td className="font-medium">{line.part.name}</td>
                          <td className="font-mono text-xs">{line.part.partNumber}</td>
                          <td>{line.part.manufacturer ?? '—'}</td>
                          <td className="text-right">
                            <input
                              className="input w-20 text-right py-1"
                              type="number"
                              min={0.000001}
                              step="any"
                              defaultValue={line.quantity}
                              onBlur={(e) => {
                                const qty = Number(e.target.value);
                                if (!Number.isFinite(qty) || qty <= 0 || qty === line.quantity) return;
                                patchLine.mutate({
                                  lineId: line.id,
                                  quantity: qty,
                                  designator: line.designator,
                                });
                              }}
                            />
                          </td>
                          <td className="text-right">
                            <button
                              type="button"
                              className="text-red-400 hover:text-red-300 text-xs"
                              onClick={() => {
                                if (confirm(t('boms.confirmDeleteLine'))) deleteLine.mutate(line.id);
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
            </div>
          )}
        </div>
      </div>

      {showCreate && (
        <CreateBomModal
          busy={createBom.isPending}
          error={createBom.error instanceof AppError ? createBom.error.message : null}
          onClose={() => setShowCreate(false)}
          onSubmit={(data) => createBom.mutate(data)}
        />
      )}

      {showAddLine && selectedId && (
        <AddLineModal
          parts={partOptions}
          busy={addLine.isPending}
          error={addLine.error instanceof AppError ? addLine.error.message : null}
          onClose={() => setShowAddLine(false)}
          onSubmit={(data) => addLine.mutate(data)}
        />
      )}

      {showImport && selectedId && (
        <ImportCsvModal
          busy={importCsv.isPending}
          error={importCsv.error instanceof AppError ? importCsv.error.message : null}
          onClose={() => setShowImport(false)}
          onSubmit={(data) => importCsv.mutate(data)}
        />
      )}
    </div>
  );
}

function CreateBomModal({
  onSubmit,
  onClose,
  busy,
  error,
}: {
  onSubmit: (data: { name: string; version: string; notes?: string }) => void;
  onClose: () => void;
  busy: boolean;
  error: string | null;
}) {
  const { t } = useTranslation();
  const [name, setName] = useState('');
  const [version, setVersion] = useState('1');
  const [notes, setNotes] = useState('');

  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center p-4 z-20">
      <div className="card w-full max-w-lg space-y-3">
        <h2 className="font-semibold">{t('boms.new')}</h2>
        <div>
          <label className="label">{t('boms.fields.name')} *</label>
          <input className="input" value={name} onChange={(e) => setName(e.target.value)} />
        </div>
        <div>
          <label className="label">{t('boms.version')}</label>
          <input className="input" value={version} onChange={(e) => setVersion(e.target.value)} />
        </div>
        <div>
          <label className="label">{t('boms.fields.notes')}</label>
          <textarea className="input" rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} />
        </div>
        {error && <div className="text-red-400 text-sm">{error}</div>}
        <div className="flex gap-2 justify-end">
          <button type="button" className="btn-ghost" onClick={onClose}>
            {t('common.cancel')}
          </button>
          <button
            type="button"
            className="btn-primary"
            disabled={busy || !name.trim()}
            onClick={() =>
              onSubmit({
                name: name.trim(),
                version: version.trim() || '1',
                notes: notes.trim() || undefined,
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

function AddLineModal({
  parts,
  onSubmit,
  onClose,
  busy,
  error,
}: {
  parts: Part[];
  onSubmit: (data: { partId: string; quantity: number; designator?: string }) => void;
  onClose: () => void;
  busy: boolean;
  error: string | null;
}) {
  const { t } = useTranslation();
  const [partId, setPartId] = useState(parts[0]?.id ?? '');
  const [quantity, setQuantity] = useState('1');
  const [designator, setDesignator] = useState('');

  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center p-4 z-20">
      <div className="card w-full max-w-lg space-y-3">
        <h2 className="font-semibold">{t('boms.addLine')}</h2>
        <div>
          <label className="label">{t('boms.fields.part')} *</label>
          <select className="input" value={partId} onChange={(e) => setPartId(e.target.value)}>
            {parts.length === 0 && <option value="">{t('boms.noParts')}</option>}
            {parts.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name} · {p.partNumber}
              </option>
            ))}
          </select>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="label">{t('boms.fields.quantity')} *</label>
            <input
              className="input"
              type="number"
              min={0.000001}
              step="any"
              value={quantity}
              onChange={(e) => setQuantity(e.target.value)}
            />
          </div>
          <div>
            <label className="label">{t('boms.fields.designator')}</label>
            <input
              className="input font-mono"
              value={designator}
              onChange={(e) => setDesignator(e.target.value)}
              placeholder="R1,R2"
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
            disabled={busy || !partId || !(Number(quantity) > 0)}
            onClick={() =>
              onSubmit({
                partId,
                quantity: Number(quantity),
                designator: designator.trim() || undefined,
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

function ImportCsvModal({
  onSubmit,
  onClose,
  busy,
  error,
}: {
  onSubmit: (data: { csv: string; createMissingParts: boolean; replaceLines: boolean }) => void;
  onClose: () => void;
  busy: boolean;
  error: string | null;
}) {
  const { t } = useTranslation();
  const [csv, setCsv] = useState(
    'Reference,Qty,MPN,Manufacturer,Description,Footprint\n"R1,R2",2,RC0603FR-0710KL,Yageo,10k 1%,0603\n',
  );
  const [createMissingParts, setCreateMissingParts] = useState(true);
  const [replaceLines, setReplaceLines] = useState(false);

  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center p-4 z-20">
      <div className="card w-full max-w-2xl space-y-3">
        <h2 className="font-semibold">{t('boms.importCsv')}</h2>
        <p className="text-xs text-zinc-400">{t('boms.importHint')}</p>
        <textarea
          className="input font-mono text-xs"
          rows={10}
          value={csv}
          onChange={(e) => setCsv(e.target.value)}
        />
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={createMissingParts}
            onChange={(e) => setCreateMissingParts(e.target.checked)}
          />
          {t('boms.createMissingParts')}
        </label>
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={replaceLines}
            onChange={(e) => setReplaceLines(e.target.checked)}
          />
          {t('boms.replaceLines')}
        </label>
        {error && <div className="text-red-400 text-sm">{error}</div>}
        <div className="flex gap-2 justify-end">
          <button type="button" className="btn-ghost" onClick={onClose}>
            {t('common.cancel')}
          </button>
          <button
            type="button"
            className="btn-primary"
            disabled={busy || !csv.trim()}
            onClick={() => onSubmit({ csv, createMissingParts, replaceLines })}
          >
            {busy ? '...' : t('boms.import')}
          </button>
        </div>
      </div>
    </div>
  );
}
