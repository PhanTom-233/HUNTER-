/**
 * 测试矩阵单元格记录面板。
 *
 * 只负责编辑一条 TestRecord：四态、N-A 原因、payload / baseline / evidence。
 * 不做任何发包、扫描或导出；CORS 固定禁用列不会走到这里。
 */

import { useCallback, useEffect, useState } from 'react';

import { NA_REASONS, TEST_STATES } from '../../../shared/constants';
import type { NaReason, TestRecord, TestState, VulnCatalogEntry } from '../../../shared/types';
import { Modal } from '../../components/Modal';
import { useToast } from '../../components/Toast';
import { api, toErrorText } from '../../lib/api';
import { CORS_VULN_ID, EXEC_MODE_META } from './matrixModel';
import type { MatrixRow } from './matrixModel';

export interface CellEditorProps {
  open: boolean;
  projectId: string;
  row: MatrixRow | null;
  entry: VulnCatalogEntry | null;
  record: TestRecord | null;
  onClose: () => void;
  onSaved: () => Promise<void> | void;
}

interface Draft {
  state: TestState;
  naReason: NaReason | '';
  payload: string;
  baseline: string;
  evidence: string;
}

function draftFrom(record: TestRecord | null): Draft {
  return {
    state: record?.state ?? '未测',
    naReason: record?.naReason ?? '',
    payload: record?.payload ?? '',
    baseline: record?.baseline ?? '',
    evidence: record?.evidence ?? '',
  };
}

export function CellEditor({
  open,
  projectId,
  row,
  entry,
  record,
  onClose,
  onSaved,
}: CellEditorProps): JSX.Element | null {
  const toast = useToast();
  const [draft, setDraft] = useState<Draft>(() => draftFrom(record));
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!open) return;
    setDraft(draftFrom(record));
    setError('');
  }, [open, record]);

  const setField = <K extends keyof Draft>(key: K, value: Draft[K]): void => {
    setDraft((current) => ({ ...current, [key]: value }));
    setError('');
  };

  const save = useCallback(async (): Promise<void> => {
    if (!row || !entry) return;
    if (entry.id === CORS_VULN_ID) {
      setError('CORS 按方法论固定不挖，不可修改');
      return;
    }

    let naReason: NaReason | null = null;
    if (draft.state === 'N-A') {
      if (!draft.naReason) {
        setError('N-A 必须选择原因（后端也会拦下）');
        return;
      }
      naReason = draft.naReason;
    }

    setSaving(true);
    try {
      await api.setTestCell(projectId, {
        assetId: row.assetId,
        endpointId: row.endpointId,
        vulnType: entry.id,
        state: draft.state,
        naReason,
        payload: draft.payload,
        baseline: draft.baseline,
        evidence: draft.evidence,
        vulnRefId: record?.vulnRefId ?? null,
      });
      toast('success', `${entry.id} 已保存为「${draft.state}」`);
      await onSaved();
      onClose();
    } catch (err) {
      const message = toErrorText(err);
      setError(message);
      toast('error', message);
    } finally {
      setSaving(false);
    }
  }, [draft, entry, onClose, onSaved, projectId, record, row, toast]);

  const remove = useCallback(async (): Promise<void> => {
    if (!record) return;
    setDeleting(true);
    try {
      await api.deleteTestRecord(projectId, record.id);
      toast('success', '测试记录已清除，格子恢复为未测');
      await onSaved();
      onClose();
    } catch (err) {
      const message = toErrorText(err);
      setError(message);
      toast('error', message);
    } finally {
      setDeleting(false);
    }
  }, [onClose, onSaved, projectId, record, toast]);

  if (!open || !row || !entry) return null;

  const mode = EXEC_MODE_META[entry.execMode];
  const busy = saving || deleting;

  return (
    <Modal
      open={open}
      title={`${entry.id} · ${row.label}`}
      subtitle={`${entry.name} · ${mode.label} · 行 ${row.endpointId ?? row.assetId}`}
      onClose={onClose}
      maxWidth={640}
      locked={busy}
      footer={
        <>
          <button type="button" className="hx-btn" onClick={onClose} disabled={busy}>
            取消
          </button>
          <button
            type="button"
            className="hx-btn hx-btn-danger"
            onClick={() => void remove()}
            disabled={!record || busy}
            title={record ? '删除记录，格子恢复为未测' : '当前格子还没有测试记录'}
          >
            删除
          </button>
          <button
            type="button"
            className="hx-btn hx-btn-primary"
            onClick={() => void save()}
            disabled={busy}
          >
            保存
          </button>
        </>
      }
    >
      {error ? <div className="hx-field-error" style={{ marginBottom: 10 }}>{error}</div> : null}

      <div className="hx-resp-hint normal" style={{ marginBottom: 10 }}>
        <div>
          <div>判定条件：{entry.passCondition}</div>
          <div className="hx-hint">最低探针：{entry.minProbe}</div>
        </div>
      </div>

      <div className="hx-form-grid-2">
        <label className="hx-field">
          <span className="hx-label">状态 *</span>
          <select
            className="hx-select"
            value={draft.state}
            onChange={(event) => setField('state', event.target.value as TestState)}
          >
            {TEST_STATES.map((state) => (
              <option key={state} value={state}>
                {state}
              </option>
            ))}
          </select>
        </label>
        <label className="hx-field">
          <span className="hx-label">N-A 原因（9 枚举）</span>
          <select
            className="hx-select"
            value={draft.naReason}
            disabled={draft.state !== 'N-A'}
            onChange={(event) => setField('naReason', event.target.value as NaReason | '')}
          >
            <option value="">未选择</option>
            {NA_REASONS.map((reason) => (
              <option key={reason} value={reason}>
                {reason}
              </option>
            ))}
          </select>
        </label>
      </div>
      <div className="hx-hint" style={{ marginBottom: 8 }}>
        N-A 没选原因会被前端与后端同时拦下；非 N-A 状态的原因会自动置空。
      </div>

      <label className="hx-field">
        <span className="hx-label">payload</span>
        <textarea
          className="hx-textarea hx-mono"
          style={{ minHeight: 64 }}
          value={draft.payload}
          onChange={(event) => setField('payload', event.target.value)}
        />
      </label>
      <label className="hx-field">
        <span className="hx-label">baseline</span>
        <textarea
          className="hx-textarea hx-mono"
          style={{ minHeight: 64 }}
          value={draft.baseline}
          onChange={(event) => setField('baseline', event.target.value)}
        />
      </label>
      <label className="hx-field">
        <span className="hx-label">evidence（回包片段）</span>
        <textarea
          className="hx-textarea hx-mono"
          style={{ minHeight: 64 }}
          value={draft.evidence}
          onChange={(event) => setField('evidence', event.target.value)}
        />
      </label>
    </Modal>
  );
}
