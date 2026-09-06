import { useState } from 'react';
import { post } from '../api.js';
import Banner from './Banner.jsx';

/**
 * 신고 버튼 + 사유/상세 입력 폼. 게시물/메시지/사용자 모두 같은 컴포넌트를 쓴다
 * (원본 ui/common.py 의 render_report_control).
 *
 * 유효성 검사(대상 존재, 자기 신고 금지, 중복 금지)는 전부 서버가 한다.
 * 여기는 화면 표시만 담당하므로, 서버와 규칙이 어긋날 여지가 없다.
 */
export default function ReportButton({ targetType, targetId, label = '신고', reasons }) {
  const [open, setOpen] = useState(false);
  const [done, setDone] = useState(false);
  const [reason, setReason] = useState(reasons[0]);
  const [detail, setDetail] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  if (done) return <span className="status done">신고 접수됨</span>;

  async function submit() {
    setBusy(true);
    setError('');
    try {
      await post('/api/reports', { targetType, targetId, reason, detail });
      setOpen(false);
      setDone(true);
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <button className="ghost sm" onClick={() => setOpen(true)}>{label}</button>
      {open && (
        <div className="modal-backdrop" onClick={() => setOpen(false)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <h3>신고하기</h3>
            <Banner kind="error">{error}</Banner>
            <div className="field">
              <label>신고 사유</label>
              <select value={reason} onChange={(e) => setReason(e.target.value)}>
                {reasons.map((r) => <option key={r} value={r}>{r}</option>)}
              </select>
            </div>
            <div className="field">
              <label>상세 내용 (선택)</label>
              <textarea value={detail} onChange={(e) => setDetail(e.target.value)} />
            </div>
            <div className="row tight">
              <button className="primary" onClick={submit} disabled={busy}>신고 제출</button>
              <button onClick={() => setOpen(false)} disabled={busy}>취소</button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
