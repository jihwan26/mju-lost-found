/**
 * 명지 스마트 분실물 센터 -- 앱 껍데기.
 *
 * 이 파일이 하는 일은 세 가지뿐이다:
 *   1. /api/me 로 로그인 상태를 가져온다
 *   2. 로그인 게이트 3단계를 통과시킨다 (로그인 -> 명지대 도메인 -> 닉네임)
 *   3. 통과하면 상단바 + 현재 경로에 맞는 화면을 그린다
 *
 * 실제 화면들은 FE/screens/, 재사용 부품은 FE/components/ 에 나뉘어 있다.
 * 어떤 경로에 어떤 화면이 붙는지는 FE/Routes.jsx 를 보면 된다.
 *
 * 기존 Streamlit 페이지와의 대응:
 *   app.py            -> screens/HomeScreen.jsx
 *   1_찾아요.py        -> screens/BoardScreen.jsx (+ BoardList, NewPostForm, PostDetailScreen)
 *   2_찾았어요.py      -> 위와 같은 파일들을 kind='found' 로 재사용
 *   3_내_게시물.py     -> screens/MyPostsScreen.jsx (+ MyPostCard)
 *   4_내_매칭.py       -> screens/MatchesScreen.jsx
 *   5_채팅.py          -> screens/ChatRoomScreen.jsx
 *   6_내_채팅.py       -> screens/ChatsScreen.jsx
 *   7_관리자.py        -> screens/AdminScreen.jsx (+ AdminReportCard)
 *   8_알림.py          -> screens/NotificationsScreen.jsx
 *   ui/common.py      -> components/ 전체
 *
 * Streamlit 은 버튼 하나 누를 때마다 스크립트를 처음부터 다시 실행했지만,
 * 여기서는 화면 상태가 React state 에 남아 있으므로 그런 재실행이 없다.
 * 대신 서버 데이터가 바뀌는 동작(등록/삭제/전송 등) 뒤에는 해당 화면이
 * 명시적으로 다시 불러온다.
 */
import { useCallback, useEffect, useState } from 'react';
import { ApiError, get, post } from './api.js';
import { navigate, useRoute } from './navigation.js';
import Routes from './Routes.jsx';
import Banner from './components/Banner.jsx';
import Loading from './components/Loading.jsx';
import TopBar from './components/TopBar.jsx';
import LoginScreen from './screens/LoginScreen.jsx';
import NicknameScreen from './screens/NicknameScreen.jsx';
import DomainBlockedScreen from './screens/DomainBlockedScreen.jsx';

export default function App() {
  const path = useRoute();
  const [me, setMe] = useState(null);
  const [fatal, setFatal] = useState('');

  const refreshMe = useCallback(async () => {
    try {
      setMe(await get('/api/me'));
    } catch (e) {
      setFatal(e instanceof ApiError ? e.message : '서버에 연결할 수 없습니다.');
    }
  }, []);

  useEffect(() => { refreshMe(); }, [refreshMe]);

  // 화면을 옮길 때마다 안 읽은 개수를 갱신한다(상단 배지가 실제 상태를 따라가도록).
  useEffect(() => { if (me?.loggedIn) refreshMe(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [path]);

  async function logout() {
    await post('/api/auth/logout', {});
    navigate('/');
    refreshMe();
  }

  if (fatal) return <div className="main"><Banner kind="error">{fatal}</Banner></div>;
  if (!me) return <div className="main"><Loading /></div>;

  // 로그인 게이트 3단계 -- 원본 app.py 의 분기 순서를 그대로 따른다.
  if (!me.loggedIn) return <div className="main"><LoginScreen me={me} onRefresh={refreshMe} /></div>;
  if (!me.domainAllowed) return <div className="main"><DomainBlockedScreen me={me} onLogout={logout} /></div>;
  if (!me.user.nickname) return <div className="main"><NicknameScreen me={me} onRefresh={refreshMe} /></div>;

  return (
    <div className="app">
      <TopBar me={me} path={path} onLogout={logout} />
      <main className="main">
        <Routes path={path} me={me} refreshMe={refreshMe} />
      </main>
      <footer className="footer">
        <p className="footer-line"><strong>명지대학교 스마트 분실물 센터</strong></p>
        <p className="footer-line">교내 구성원(@mju.ac.kr)만 이용할 수 있습니다</p>
        <p className="footer-line">바이브코딩 경진대회 출품작</p>
      </footer>
    </div>
  );
}
