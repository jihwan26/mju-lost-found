import { useState } from 'react';
import { del, patch, sendForm } from '../api.js';
import { navigate } from '../navigation.js';
import { BOARD_META } from '../constants.js';
import Banner from '../components/Banner.jsx';
import Thumb from '../components/Thumb.jsx';
import StatusPill from '../components/StatusPill.jsx';
import ConfirmModal from '../components/ConfirmModal.jsx';

/**
 * 내 게시물 한 건 -- 상태 변경 / 수정 폼 / 삭제.
 * 소유권 검사는 서버(db.checkPostOwner)가 하므로 여기는 화면만 담당한다.
 */
export default function MyPostCard({ kind, post: p, me, onChanged }) {
  const meta = BOARD_META[kind];
  const [editing, setEditing] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [form, setForm] = useState({
    title: p.title, description: p.description, category: p.category,
    location: p.location, campus: p.campus,
  });
  const [files, setFiles] = useState([]);

  const nextStatus = kind === 'lost' ? '찾음' : '완료';
  const isOpen = kind === 'lost' ? p.status === '찾는 중' : p.status === '보관 중';

  /** 서버 호출 + 로딩/에러 처리 + 성공 시 목록 새로고침을 묶은 공통 껍데기. */
  async function run(fn) {
    setBusy(true);
    setError('');
    try {
      await fn();
      onChanged();
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }

  async function saveEdit(e) {
    e.preventDefault();
    await run(async () => {
      const fd = new FormData();
      fd.append('title', form.title);
      fd.append('description', form.description);
      fd.append('category', form.category);
      fd.append('location', form.location);
      fd.append('campus', form.campus);
      // 파일을 고르지 않았으면 아무것도 보내지 않는다 -> 서버가 기존 사진을 유지한다.
      for (const f of files) fd.append('images', f);
      await sendForm(`/api/posts/${kind}/${p.id}`, 'PATCH', fd);
      setEditing(false);
    });
  }

  return (
    <div className="card">
      <div className="card-row">
        <Thumb src={p.image_url} />
        <div className="card-body">
          <p className="card-title">{p.title} <StatusPill status={p.status} /></p>
          <p className="meta">
            <span className="tag">{me.campuses.find((c) => c.key === p.campus)?.label ?? p.campus}</span>
            <span className="sep">·</span>{p.category}<span className="sep">·</span>{p.location}
            <span className="sep">·</span>{p[meta.dateField]}
          </p>
          <p className="faint">작성일 {p.created_at}<span className="sep">·</span>조회 {p.view_count ?? 0}</p>
        </div>
        <div className="card-actions">
          <button className="sm" onClick={() => navigate(`/${kind}/${p.id}`)}>상세보기</button>
          <button className="sm" onClick={() => setEditing((v) => !v)}>{editing ? '수정 닫기' : '수정'}</button>
          <button className="danger sm" onClick={() => setConfirmDelete(true)}>삭제</button>
        </div>
      </div>

      <Banner kind="error" onClose={() => setError('')}>{error}</Banner>

      {isOpen ? (
        <button
          className="sm"
          style={{ marginTop: 8 }}
          disabled={busy}
          onClick={() => run(() => patch(`/api/posts/${kind}/${p.id}/status`, { status: nextStatus }))}
        >
          &lsquo;{nextStatus}&rsquo;으로 상태 변경
        </button>
      ) : (
        <p className="faint" style={{ marginBottom: 0 }}>이미 &lsquo;{p.status}&rsquo; 상태입니다.</p>
      )}

      {editing && (
        <form className="section" onSubmit={saveEdit}>
          <h3>게시물 수정</h3>
          <div className="field">
            <label>제목 *</label>
            <input type="text" value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} required />
          </div>
          <div className="field">
            <label>설명 *</label>
            <textarea value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} required />
          </div>
          <div className="row">
            <div className="field">
              <label>카테고리 *</label>
              <select value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })}>
                {me.categories.map((c) => <option key={c} value={c}>{c}</option>)}
              </select>
            </div>
            <div className="field">
              <label>캠퍼스 *</label>
              <select value={form.campus} onChange={(e) => setForm({ ...form, campus: e.target.value })}>
                {me.campuses.map((c) => <option key={c.key} value={c.key}>{c.label}</option>)}
              </select>
            </div>
          </div>
          <div className="row">
            <div className="field">
              <label>장소 *</label>
              <input type="text" value={form.location} onChange={(e) => setForm({ ...form, location: e.target.value })} required />
            </div>
          </div>
          {/* 분실/습득 시각은 원본과 동일하게 수정 대상이 아니다 (서버도 이 필드를 안 받는다). */}
          <p className="faint">
            {meta.dateLabel} 시간: {p[meta.dateField]} (수정하려면 게시물을 삭제 후 다시 등록해주세요)
          </p>
          <div className="field">
            <label>사진 교체 (선택 · 비워두면 기존 사진 유지 · 최대 {me.maxPostImages}장)</label>
            <input
              type="file"
              accept=".jpg,.jpeg,.png"
              multiple
              onChange={(e) => setFiles([...e.target.files].slice(0, me.maxPostImages))}
            />
          </div>
          <button className="primary" type="submit" disabled={busy}>수정 저장</button>
        </form>
      )}

      {confirmDelete && (
        <ConfirmModal
          title="게시물 삭제"
          message="정말 삭제하시겠습니까? 이 작업은 되돌릴 수 없으며, 연결된 매칭·채팅방도 함께 사라집니다."
          confirmLabel="네, 삭제합니다"
          busy={busy}
          onCancel={() => setConfirmDelete(false)}
          onConfirm={() => run(async () => {
            await del(`/api/posts/${kind}/${p.id}`);
            setConfirmDelete(false);
          })}
        />
      )}
    </div>
  );
}
