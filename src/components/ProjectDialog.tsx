/**
 * 新建项目弹窗：字段校验与后端保持一致（前端只是提前拦，最终以后端为准）。
 */

import { useEffect, useState } from 'react';

import { MODE_META, PROJECT_NAME_MAX, TARGET_NAME_MAX } from '../../shared/constants';
import type { CreateProjectInput, ProjectMode } from '../../shared/types';
import { Icon } from './Icons';
import { Modal } from './Modal';
import { useToast } from './Toast';

interface FormState {
  name: string;
  targetName: string;
  mode: ProjectMode;
  scopeNote: string;
  srcUrl: string;
}

type FieldErrors = Partial<Record<keyof FormState, string>>;

const EMPTY_FORM: FormState = {
  name: '',
  targetName: '',
  mode: 'lock',
  scopeNote: '',
  srcUrl: '',
};

const SRC_URL_MAX = 500;
const NOTE_MAX = 2000;

function validate(form: FormState): FieldErrors {
  const errors: FieldErrors = {};

  const name = form.name.trim();
  if (!name) errors.name = '项目名称必填';
  else if (name.length > PROJECT_NAME_MAX) errors.name = `项目名称不能超过 ${PROJECT_NAME_MAX} 个字符`;

  const targetName = form.targetName.trim();
  if (!targetName) errors.targetName = '目标名称必填';
  else if (targetName.length > TARGET_NAME_MAX)
    errors.targetName = `目标名称不能超过 ${TARGET_NAME_MAX} 个字符`;

  if (form.mode !== 'lock' && form.mode !== 'free') errors.mode = '请选择模式';

  if (form.scopeNote.trim().length > NOTE_MAX)
    errors.scopeNote = `授权范围说明不能超过 ${NOTE_MAX} 个字符`;

  const srcUrl = form.srcUrl.trim();
  if (srcUrl) {
    if (!/^https?:\/\//i.test(srcUrl)) {
      errors.srcUrl = '必须以 http:// 或 https:// 开头';
    } else if (srcUrl.length > SRC_URL_MAX) {
      errors.srcUrl = `不能超过 ${SRC_URL_MAX} 个字符`;
    } else {
      try {
        // eslint-disable-next-line no-new
        new URL(srcUrl);
      } catch {
        errors.srcUrl = '不是合法的 URL';
      }
    }
  }

  return errors;
}

export interface ProjectDialogProps {
  open: boolean;
  onClose: () => void;
  /** 父级负责调接口、关闭弹窗、弹 toast；抛错则弹窗保持打开 */
  onSubmit: (input: CreateProjectInput) => Promise<void>;
}

export function ProjectDialog({ open, onClose, onSubmit }: ProjectDialogProps): JSX.Element {
  const toast = useToast();
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [errors, setErrors] = useState<FieldErrors>({});
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (open) {
      setForm(EMPTY_FORM);
      setErrors({});
      setSubmitting(false);
    }
  }, [open]);

  const patch = <K extends keyof FormState>(key: K, value: FormState[K]): void => {
    setForm((prev) => ({ ...prev, [key]: value }));
    setErrors((prev) => {
      if (!prev[key]) return prev;
      const next = { ...prev };
      delete next[key];
      return next;
    });
  };

  const handleSubmit = async (): Promise<void> => {
    const found = validate(form);
    setErrors(found);
    if (Object.keys(found).length > 0) {
      toast('error', '有字段还需要修正，看输入框下方的提示');
      return;
    }
    setSubmitting(true);
    try {
      await onSubmit({
        name: form.name.trim(),
        targetName: form.targetName.trim(),
        mode: form.mode,
        scopeNote: form.scopeNote.trim(),
        srcUrl: form.srcUrl.trim(),
      });
    } catch {
      // 错误提示由父级统一 toast，这里只保证按钮恢复可用
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Modal
      open={open}
      title="新建项目"
      onClose={onClose}
      locked={submitting}
      maxWidth={620}
      footer={
        <>
          <button type="button" className="hx-btn" onClick={onClose} disabled={submitting}>
            取消
          </button>
          <button
            type="button"
            className="hx-btn hx-btn-primary"
            onClick={() => void handleSubmit()}
            disabled={submitting}
          >
            {submitting ? (
              <>
                <Icon name="spinner" size={13} className="hx-spin" />
                创建中…
              </>
            ) : (
              <>
                <Icon name="plus" size={13} />
                创建项目
              </>
            )}
          </button>
        </>
      }
    >
      <form
        onSubmit={(event) => {
          event.preventDefault();
          void handleSubmit();
        }}
      >
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
          <div className="hx-field">
            <label className="hx-label" htmlFor="hx-project-name">
              项目名称 <span style={{ color: 'var(--red)' }}>*</span>
            </label>
            <input
              id="hx-project-name"
              className="hx-input"
              value={form.name}
              maxLength={PROJECT_NAME_MAX}
              placeholder="某集团_SRC挖洞"
              onChange={(event) => patch('name', event.target.value)}
              autoFocus
            />
            {errors.name ? <div className="hx-field-error">{errors.name}</div> : null}
          </div>

          <div className="hx-field">
            <label className="hx-label" htmlFor="hx-project-target">
              目标名称 <span style={{ color: 'var(--red)' }}>*</span>
            </label>
            <input
              id="hx-project-target"
              className="hx-input"
              value={form.targetName}
              maxLength={TARGET_NAME_MAX}
              placeholder="某集团有限公司"
              onChange={(event) => patch('targetName', event.target.value)}
            />
            {errors.targetName ? (
              <div className="hx-field-error">{errors.targetName}</div>
            ) : null}
          </div>
        </div>

        <div className="hx-field">
          <span className="hx-label">模式</span>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
            {(['lock', 'free'] as ProjectMode[]).map((mode) => {
              const meta = MODE_META[mode];
              const on = form.mode === mode;
              return (
                <button
                  key={mode}
                  type="button"
                  className={`hx-mode-card${on ? ' on' : ''}`}
                  onClick={() => patch('mode', mode)}
                  aria-pressed={on}
                >
                  <span className="hx-mode-card-head">
                    <Icon name={mode === 'lock' ? 'lock' : 'free'} size={13} />
                    {meta.label}
                    <span className="hx-card-title-hint">{meta.short}</span>
                  </span>
                </button>
              );
            })}
          </div>
          {errors.mode ? <div className="hx-field-error">{errors.mode}</div> : null}
        </div>

        <div className="hx-field">
          <label className="hx-label" htmlFor="hx-project-scope">
            授权范围说明
          </label>
          <textarea
            id="hx-project-scope"
            className="hx-textarea"
            value={form.scopeNote}
            maxLength={NOTE_MAX}
            placeholder="写清这次能打什么：授权域名 / 子域范围 / 明确排除项 / SRC 项目页面链接。例如：only *.example.com，不含 *.test.example.com"
            onChange={(event) => patch('scopeNote', event.target.value)}
          />
          <div className="hx-hint" style={{ marginTop: 5 }}>
            这条会显示在总览的项目信息卡里，也会进「生成下一步提示词」。
          </div>
          {errors.scopeNote ? <div className="hx-field-error">{errors.scopeNote}</div> : null}
        </div>

        <div className="hx-field" style={{ marginBottom: 0 }}>
          <label className="hx-label" htmlFor="hx-project-src">
            SRC 项目地址（可空）
          </label>
          <input
            id="hx-project-src"
            className="hx-input"
            value={form.srcUrl}
            placeholder="https://src.example.com/project/123"
            onChange={(event) => patch('srcUrl', event.target.value)}
          />
          {errors.srcUrl ? <div className="hx-field-error">{errors.srcUrl}</div> : null}
        </div>

        {/* 让回车能提交（button 隐藏但可被表单触发） */}
        <button type="submit" style={{ display: 'none' }} aria-hidden="true" tabIndex={-1} />
      </form>
    </Modal>
  );
}
