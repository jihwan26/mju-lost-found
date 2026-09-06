import { useCallback, useEffect, useRef, useState } from 'react';
import { get, post, qs } from '../api.js';
import { navigate } from '../navigation.js';
import Banner from '../components/Banner.jsx';
import Loading from '../components/Loading.jsx';
import ReportButton from '../components/ReportButton.jsx';

/**
 * 채팅방 (원본 pages/5_채팅.py).
 *
 * 매칭 방과 다이렉트 방 모두 같은 화면을 쓴다 -- 헤더에 뭘 쓸지는 서버가
 * getChatRoomView 에서 이미 계산해서 내려준다.
 */
export default function ChatRoomScreen({ roomId, me, onCountsChanged }) {
  const [room, setRoom] = useState(null);
  const [messages, setMessages] = useState([]);
  const [hasMore, setHasMore] = useState(false);
  const [draft, setDraft] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const logRef = useRef(null);
  const shouldScrollRef = useRef(true);
  // 지금 화면에 있는 메시지의 사본. refresh 가 최신 목록을 "지금 당장" 읽어야 하는데,
  // setMessages 의 업데이터 함수는 렌더 단계에서야 실행되므로 그 안에서 계산한 값을
  // 곧바로 쓸 수 없다. 그래서 state 와 나란히 ref 를 직접 갱신한다.
  const messagesRef = useRef([]);

  const applyMessages = useCallback((next) => {
    messagesRef.current = next;
    setMessages(next);
  }, []);

  /**
   * 최신 페이지를 다시 받아와 기존 목록에 "없던 것만" 덧붙인다.
   * 이미 불러온 메시지는 절대 지우지 않는다 -- 매번 "최신 N개"로 통째 교체하면,
   * 그 사이 메시지가 늘었을 때 중간 구간이 통째로 사라질 수 있기 때문이다
   * (원본 pages/5_채팅.py 가 session_state 로 하던 병합과 같은 이유).
   */
  const refresh = useCallback(async () => {
    try {
      const data = await get(`/api/chats/${roomId}/messages`);
      const prev = messagesRef.current;

      if (!prev.length) {
        setHasMore(data.hasMore);
        applyMessages(data.messages);
      } else {
        const seen = new Set(prev.map((m) => m.id));
        const added = data.messages.filter((m) => !seen.has(m.id));
        // 읽음 표시가 갱신될 수 있으므로 기존 메시지도 최신 페이지 값으로 덮어쓴다.
        const updates = new Map(data.messages.map((m) => [m.id, m]));
        const merged = prev.map((m) => updates.get(m.id) || m).concat(added)
          .sort((a, b) => a.id - b.id);
        // 5초마다 도는 폴링이라, 바뀐 게 없으면 상태를 건드리지 않는다
        // (불필요한 재렌더와 스크롤 튐을 막는다).
        const sig = (list) => list.map((m) => `${m.id}:${m.read_at || ''}:${m.content.length}`).join('|');
        if (sig(merged) !== sig(prev)) applyMessages(merged);
      }

      // 방을 열어 둔 채로 상대 메시지를 새로 받았다면 그 자리에서 읽음 처리한다.
      // 이게 없으면 상대방 화면에는 계속 '안 읽음'으로 남는다.
      const hasUnreadIncoming = data.messages.some(
        (m) => m.sender_user_id !== me.user.id && !m.read_at
      );
      if (hasUnreadIncoming) {
        await post(`/api/chats/${roomId}/read`, {});
        onCountsChanged();
      }
    } catch (e) {
      setError(e.message);
    }
  }, [roomId, me.user.id, onCountsChanged, applyMessages]);

  useEffect(() => {
    let alive = true;
    applyMessages([]);
    setRoom(null);
    (async () => {
      try {
        const view = await get(`/api/chats/${roomId}`);
        if (!alive) return;
        setRoom(view);
        // 방에 실제로 들어온 이 시점에만 읽음 처리한다(목록 화면에서는 하지 않음).
        await post(`/api/chats/${roomId}/read`, {});
        onCountsChanged();
        await refresh();
      } catch (e) {
        if (alive) setError(e.message);
      }
    })();
    return () => { alive = false; };
  }, [roomId, refresh, onCountsChanged, applyMessages]);

  // 상대방 메시지를 받아보려면 주기적으로 다시 물어봐야 한다.
  // (WebSocket 없이 5초 폴링 -- 원본 Streamlit 도 새로고침에 의존했다.)
  useEffect(() => {
    const timer = setInterval(refresh, 5000);
    return () => clearInterval(timer);
  }, [refresh]);

  // 새 메시지가 오면 아래로 스크롤. 단, "이전 메시지 불러오기" 직후에는 하지 않는다.
  useEffect(() => {
    if (shouldScrollRef.current && logRef.current) {
      logRef.current.scrollTop = logRef.current.scrollHeight;
    }
    shouldScrollRef.current = true;
  }, [messages]);

  async function loadOlder() {
    if (!messages.length) return;
    // 위로 페이지를 붙이는 중이므로 이번에는 맨 아래로 스크롤하지 않는다.
    shouldScrollRef.current = false;
    try {
      const data = await get(`/api/chats/${roomId}/messages${qs({ before_id: messages[0].id })}`);
      applyMessages([...data.messages, ...messagesRef.current]);
      setHasMore(data.hasMore);
    } catch (e) {
      setError(e.message);
    }
  }

  async function submit(e) {
    e.preventDefault();
    const content = draft.trim();
    if (!content) return;
    setBusy(true);
    setError('');
    try {
      await post(`/api/chats/${roomId}/messages`, { content });
      setDraft('');
      await refresh();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  if (error && !room) return <Banner kind="error">{error}</Banner>;
  if (!room) return <Loading />;

  return (
    <>
      <button className="ghost sm" onClick={() => navigate('/chats')}>← 내 채팅</button>

      <div className="page-head" style={{ marginTop: 12 }}>
        <h1>{room.otherNickname}님과의 대화</h1>
        <p>
          {room.myPostLabel} · {room.otherPostLabel}
          {room.score !== null && <> · <span className="mono-score">AI 유사도 점수: {room.score.toFixed(2)}</span></>}
        </p>
      </div>

      {room.otherUserId && (
        <div style={{ marginBottom: 12 }}>
          <ReportButton
            targetType="user"
            targetId={room.otherUserId}
            label={`${room.otherNickname}님 신고`}
            reasons={me.reportReasons}
          />
        </div>
      )}

      <Banner kind="error" onClose={() => setError('')}>{error}</Banner>

      <div className="chat-log" ref={logRef}>
        {hasMore && (
          <div style={{ textAlign: 'center', marginBottom: 12 }}>
            <button className="ghost sm" onClick={loadOlder}>이전 메시지 불러오기</button>
          </div>
        )}
        {messages.length === 0 && (
          <p className="muted" style={{ textAlign: 'center' }}>
            아직 주고받은 메시지가 없습니다. 첫 메시지를 보내보세요.
          </p>
        )}
        {messages.map((m) => {
          const mine = m.sender_user_id === me.user.id;
          return (
            <div className={`msg ${mine ? 'mine' : ''}`} key={m.id}>
              {!mine && <span className="faint">{m.sender_nickname}</span>}
              <div className="bubble">{m.content}</div>
              <div className="msg-meta">
                <span>{m.created_at}</span>
                {mine && <span>{m.read_at ? '읽음' : '안 읽음'}</span>}
                {!mine && (
                  <ReportButton
                    targetType="message"
                    targetId={m.id}
                    label="신고"
                    reasons={me.reportReasons}
                  />
                )}
              </div>
            </div>
          );
        })}
      </div>

      <form className="composer" onSubmit={submit}>
        <input
          type="text"
          value={draft}
          placeholder="메시지를 입력하세요"
          onChange={(e) => setDraft(e.target.value)}
        />
        <button className="primary" type="submit" disabled={busy || !draft.trim()}>보내기</button>
      </form>
    </>
  );
}
