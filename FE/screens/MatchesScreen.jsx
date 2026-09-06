import { useCallback, useEffect, useState } from 'react';
import { del, get, post } from '../api.js';
import { navigate } from '../navigation.js';
import Banner from '../components/Banner.jsx';
import Empty from '../components/Empty.jsx';
import Loading from '../components/Loading.jsx';
import ConfirmModal from '../components/ConfirmModal.jsx';
import ReportButton from '../components/ReportButton.jsx';

/**
 * 내 매칭 (원본 pages/4_내_매칭.py).
 *
 * 한 매칭에서 내가 분실자일 수도, 습득자일 수도, (내 글끼리 매칭했다면) 둘 다일 수도 있다.
 * 그래서 "상대방"은 내가 어느 쪽인지 보고 매번 계산한다.
 */
export default function MatchesScreen({ me }) {
  const [matches, setMatches] = useState(null);
  const [error, setError] = useState('');
  const [cancelId, setCancelId] = useState(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(() => {
    get('/api/matches').then(setMatches).catch((e) => setError(e.message));
  }, []);
  useEffect(load, [load]);

  async function openChat(matchId) {
    setError('');
    try {
      const room = await post('/api/chats/from-match', { matchId });
      navigate(`/chats/${room.id}`);
    } catch (e) {
      setError(e.message);
    }
  }

  async function cancelMatch() {
    setBusy(true);
    try {
      await del(`/api/matches/${cancelId}`);
      setCancelId(null);
      load();
    } catch (e) {
      setError(e.message);
      setCancelId(null);
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <div className="page-head">
        <h1>내 매칭</h1>
        <p>내가 확정한 AI 매칭 결과를 확인하고, 필요하면 취소할 수 있습니다.</p>
      </div>
      <Banner kind="error" onClose={() => setError('')}>{error}</Banner>

      {!matches ? <Loading /> : matches.length === 0 ? (
        <Empty>
          아직 확정된 매칭이 없습니다.<br />
          게시물 상세의 &lsquo;AI로 유사한 OO 찾기&rsquo; 결과에서 &lsquo;내 물건 같아요&rsquo;를 눌러 매칭을 확정해보세요.
        </Empty>
      ) : matches.map((m) => {
        const isLostOwner = m.lost_post_user_id === me.user.id;
        const isFoundOwner = m.found_post_user_id === me.user.id;
        const otherNickname = isLostOwner ? m.found_user_nickname : m.lost_user_nickname;
        const otherUserId = isLostOwner ? m.found_post_user_id : m.lost_post_user_id;
        const roles = [
          isLostOwner && '내가 분실자(찾아요 작성자)',
          isFoundOwner && '내가 습득자(찾았어요 작성자)',
        ].filter(Boolean).join(' · ');

        return (
          <div className="card" key={m.match_id}>
            <p className="card-title">
              {m.lost_title} ↔ {m.found_title}
              {m.unread_count > 0 && <span className="badge">{m.unread_count}</span>}
              {m.completed_at && <span className="tag done" style={{ marginLeft: 8 }}>거래 완료</span>}
            </p>
            <p className="meta">{roles}</p>
            <p className="meta">
              상대방: {otherNickname}{' '}
              <ReportButton
                targetType="user"
                targetId={otherUserId}
                label={`${otherNickname}님 신고`}
                reasons={me.reportReasons}
              />
            </p>

            <div className="row" style={{ marginTop: 10 }}>
              <div>
                <p className="meta"><b>찾아요 (분실물)</b></p>
                <p className="faint">{m.lost_category} · {m.lost_location} · {m.lost_at} · 상태: {m.lost_status}</p>
              </div>
              <div>
                <p className="meta"><b>찾았어요 (습득물)</b></p>
                <p className="faint">{m.found_category} · {m.found_location} · {m.found_at} · 상태: {m.found_status}</p>
              </div>
            </div>

            <p className="faint mono-score">
              AI 유사도 점수: {m.score.toFixed(2)} · 매칭 확정일: {m.match_created_at}
            </p>

            <div className="row tight" style={{ marginTop: 10 }}>
              <button className="sm" onClick={() => navigate(isLostOwner ? `/found/${m.found_post_id}` : `/lost/${m.lost_post_id}`)}>
                상대 게시물 보기
              </button>
              <button className="primary sm" onClick={() => openChat(m.match_id)}>채팅하기</button>
              {/* 완료된 매칭은 되돌릴 수 없으므로 취소 버튼을 감춘다(서버도 거부한다). */}
              {!m.completed_at && (
                <button className="danger sm" onClick={() => setCancelId(m.match_id)}>매칭 취소</button>
              )}
            </div>
          </div>
        );
      })}

      {cancelId !== null && (
        <ConfirmModal
          title="매칭 취소"
          message="정말 매칭을 취소하시겠습니까? 연결된 채팅방도 함께 사라집니다."
          confirmLabel="네, 취소합니다"
          busy={busy}
          onCancel={() => setCancelId(null)}
          onConfirm={cancelMatch}
        />
      )}
    </>
  );
}
