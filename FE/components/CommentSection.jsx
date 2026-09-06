import { useCallback, useEffect, useState } from 'react';
import { del, get, post } from '../api.js';
import Banner from './Banner.jsx';
import Loading from './Loading.jsx';
import TrustScore from './TrustScore.jsx';

/**
 * 게시물 댓글.
 * 삭제 버튼은 내 댓글이거나 내가 관리자일 때만 보여준다 -- 다만 실제 권한 판단은
 * 서버(db.deleteComment)가 다시 하므로, 여기서 숨기는 건 헛클릭 방지용이다.
 */
export default function CommentSection({ kind, postId, me }) {
  const [comments, setComments] = useState(null);
  const [draft, setDraft] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const load = useCallback(() => {
    get(`/api/posts/${kind}/${postId}/comments`)
      .then(setComments)
      .catch((e) => setError(e.message));
  }, [kind, postId]);
  useEffect(load, [load]);

  async function submit(e) {
    e.preventDefault();
    const content = draft.trim();
    if (!content) return;
    setBusy(true);
    setError('');
    try {
      await post(`/api/posts/${kind}/${postId}/comments`, { content });
      setDraft('');
      load();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  async function remove(id) {
    setError('');
    try {
      await del(`/api/comments/${id}`);
      load();
    } catch (e) {
      setError(e.message);
    }
  }

  return (
    <div className="section">
      <h3>댓글 {comments ? `${comments.length}` : ''}</h3>
      <Banner kind="error" onClose={() => setError('')}>{error}</Banner>

      {!comments ? <Loading /> : comments.length === 0 ? (
        <p className="muted">아직 댓글이 없습니다. 첫 댓글을 남겨보세요.</p>
      ) : (
        <div className="list" style={{ marginBottom: 16 }}>
          {comments.map((c) => (
            <div className="list-item" key={c.id} style={{ padding: '12px 8px' }}>
              <div className="list-body">
                <p className="meta" style={{ marginBottom: 2 }}>
                  <b>{c.author_nickname}</b>
                  <span className="sep">·</span>
                  <TrustScore score={c.author_trust_score} showLabel={false} />
                  <span className="sep">·</span>
                  <span className="faint">{c.created_at}</span>
                </p>
                <p className="desc" style={{ marginTop: 2 }}>{c.content}</p>
              </div>
              {(c.user_id === me.user.id || me.user.isAdmin) && (
                <div className="list-actions">
                  <button className="ghost sm" onClick={() => remove(c.id)}>삭제</button>
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      <form className="composer" onSubmit={submit}>
        <input
          type="text"
          value={draft}
          maxLength={500}
          placeholder="댓글을 입력하세요"
          onChange={(e) => setDraft(e.target.value)}
        />
        <button className="primary" type="submit" disabled={busy || !draft.trim()}>등록</button>
      </form>
    </div>
  );
}
