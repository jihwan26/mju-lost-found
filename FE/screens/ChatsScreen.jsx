import { useEffect, useState } from 'react';
import { get } from '../api.js';
import { navigate } from '../navigation.js';
import Banner from '../components/Banner.jsx';
import Empty from '../components/Empty.jsx';
import Loading from '../components/Loading.jsx';

/**
 * 내 채팅 목록 (원본 pages/6_내_채팅.py).
 *
 * 서버가 매칭 방/다이렉트 방 모두에 other_nickname·unread_count 를 통일해서 채워주므로
 * 화면에서는 room_type 으로 부제목 줄만 갈라 쓰면 된다.
 * 목록의 주인공은 "누구와의 대화인가"라서 상대 닉네임을 제목 자리에 둔다.
 */
export default function ChatsScreen() {
  const [rooms, setRooms] = useState(null);
  const [error, setError] = useState('');

  useEffect(() => {
    get('/api/chats').then(setRooms).catch((e) => setError(e.message));
  }, []);

  return (
    <>
      <div className="page-head">
        <h1>내 채팅</h1>
        <p>내가 참여 중인 채팅방을 최근 대화 순으로 확인할 수 있습니다.</p>
      </div>
      <Banner kind="error" onClose={() => setError('')}>{error}</Banner>

      {!rooms ? <Loading /> : rooms.length === 0 ? (
        <Empty>
          아직 시작한 채팅이 없습니다.<br />
          게시물 상세에서 &lsquo;작성자와 채팅하기&rsquo;를 눌러 대화를 시작해보세요.
        </Empty>
      ) : (
        <div className="list">
          {rooms.map((r) => (
            <div className="list-item" key={r.chat_room_id}>
              <div className="list-body">
                <p className="item-title">
                  {r.other_nickname}
                  {r.unread_count > 0 && <span className="badge">{r.unread_count}</span>}
                </p>
                <p className="meta">
                  {r.room_type === 'match'
                    ? (
                      <>
                        {r.lost_title} ↔ {r.found_title}
                        <span className="sep">·</span>
                        <span className="mono-score">유사도 {r.score.toFixed(2)}</span>
                      </>
                    )
                    : <>{r.post_title}<span className="sep">·</span>게시글에서 시작한 문의</>}
                </p>
                {r.last_message_content
                  ? (
                    <>
                      <p className="desc">{r.last_message_content}</p>
                      <p className="faint">{r.last_message_created_at}</p>
                    </>
                  )
                  : <p className="faint">아직 메시지가 없습니다.</p>}
              </div>
              <div className="list-actions">
                <button className="primary sm" onClick={() => navigate(`/chats/${r.chat_room_id}`)}>
                  채팅하기
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </>
  );
}
