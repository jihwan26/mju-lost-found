import { navigate } from '../navigation.js';

/**
 * 상단 헤더 -- 로고 줄 + 메뉴 줄 2단.
 * 현재 위치는 배경색이 아니라 밑줄로 표시한다(게시판 탭처럼).
 * 안 읽은 개수는 /api/me 가 내려주는 counts 를 그대로 쓴다.
 */
export default function TopBar({ me, path, onLogout }) {
  const unreadMsg = me.counts?.unreadMessages || 0;
  const unreadNotif = me.counts?.unreadNotifications || 0;

  const items = [
    { path: '/', label: '홈' },
    { path: '/lost', label: '찾아요' },
    { path: '/found', label: '찾았어요' },
    { path: '/my-posts', label: '내 게시물' },
    { path: '/matches', label: '내 매칭' },
    { path: '/chats', label: '내 채팅', count: unreadMsg },
    { path: '/notifications', label: '알림', count: unreadNotif },
    ...(me.user.isAdmin ? [{ path: '/admin', label: '관리자' }] : []),
  ];

  return (
    <header className="topbar">
      <div className="topbar-inner">
        <div className="topbar-top">
          <div className="logo" onClick={() => navigate('/')}>
            명지 <span>분실물</span>
          </div>
          <button className="ghost sm" onClick={onLogout} title={me.user.email}>
            {me.user.nickname} · 로그아웃
          </button>
        </div>
        <nav className="nav">
          {items.map((it) => (
            <button
              key={it.path}
              // 홈만 정확히 일치할 때 활성. 나머지는 /lost/3 같은 하위 경로도 포함한다.
              className={it.path === '/' ? (path === '/' ? 'active' : '') : (path.startsWith(it.path) ? 'active' : '')}
              onClick={() => navigate(it.path)}
            >
              {it.label}
              {it.count > 0 && <span className="badge">{it.count}</span>}
            </button>
          ))}
        </nav>
      </div>
    </header>
  );
}
