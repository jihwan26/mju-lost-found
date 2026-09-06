import { navigate } from '../navigation.js';
import Banner from '../components/Banner.jsx';

/**
 * 홈 화면 (원본 app.py).
 * 카드 격자 대신 세로 목록으로 둔다 -- 항목이 7개뿐이라 격자로 흩어 놓는 것보다
 * 한 줄씩 읽어 내려가는 편이 빠르고, 게시판 성격에도 맞는다.
 */
export default function HomeScreen({ me }) {
  const unreadMsg = me.counts?.unreadMessages || 0;
  const unreadNotif = me.counts?.unreadNotifications || 0;

  const items = [
    { path: '/lost', title: '찾아요', desc: '물건을 잃어버렸다면 등록하고, 등록된 습득물과 비교해보세요.' },
    { path: '/found', title: '찾았어요', desc: '물건을 주웠다면 등록해서 원래 주인을 찾아주세요.' },
    { path: '/my-posts', title: '내 게시물', desc: '내가 쓴 글을 확인하고 수정·삭제·상태 변경을 할 수 있습니다.' },
    { path: '/matches', title: '내 매칭', desc: '확정한 AI 매칭 결과를 확인하고 필요하면 취소할 수 있습니다.', count: unreadMsg },
    { path: '/chats', title: '내 채팅', desc: '참여 중인 채팅방을 최근 대화 순으로 확인할 수 있습니다.', count: unreadMsg },
    { path: '/notifications', title: '알림', desc: '새 메시지·매칭·신고 처리 결과 등의 알림을 확인할 수 있습니다.', count: unreadNotif },
    // 관리자 항목은 관리자에게만 보인다. 다만 이걸 숨기는 것 자체가 보안 경계는
    // 아니며, 실제 검증은 서버의 requireAdminUser + db 계층에서 다시 이루어진다.
    ...(me.user.isAdmin
      ? [{ path: '/admin', title: '관리자', desc: '신고된 게시물·메시지·사용자를 검토하고 처리합니다.' }]
      : []),
  ];

  return (
    <>
      <div className="page-head">
        <h1>명지대학교 분실물 센터</h1>
        <p>
          교내에서 잃어버리거나 주운 물건을 등록하면, AI가 제목·설명·카테고리·장소를
          분석해 서로 관련 있는 글을 찾아줍니다.
        </p>
      </div>

      {me.user.isSuspended && (
        <Banner kind="error">
          현재 계정이 정지 상태입니다. 게시물 등록·매칭 확정·메시지 전송이 제한됩니다.
          {' '}(기존 내용 열람과 알림 확인은 가능합니다.)
        </Banner>
      )}

      <div className="menu">
        {items.map((it) => (
          <button className="menu-item" key={it.path} onClick={() => navigate(it.path)}>
            <h3>
              {it.title}
              {it.count > 0 && <span className="badge">{it.count}</span>}
            </h3>
            <p>{it.desc}</p>
          </button>
        ))}
      </div>
    </>
  );
}
