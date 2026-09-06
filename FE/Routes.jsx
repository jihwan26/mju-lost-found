import { navigate } from './navigation.js';
import Empty from './components/Empty.jsx';
import HomeScreen from './screens/HomeScreen.jsx';
import BoardScreen from './screens/BoardScreen.jsx';
import PostDetailScreen from './screens/PostDetailScreen.jsx';
import MyPostsScreen from './screens/MyPostsScreen.jsx';
import MatchesScreen from './screens/MatchesScreen.jsx';
import ChatsScreen from './screens/ChatsScreen.jsx';
import ChatRoomScreen from './screens/ChatRoomScreen.jsx';
import NotificationsScreen from './screens/NotificationsScreen.jsx';
import AdminScreen from './screens/AdminScreen.jsx';
import ProfileScreen from './screens/ProfileScreen.jsx';

/**
 * 경로 문자열 -> 화면.
 *
 *   /                 홈
 *   /lost, /found     게시판 목록 + 새 글 등록
 *   /lost/3           게시물 상세
 *   /my-posts         내 게시물
 *   /matches          내 매칭
 *   /chats            내 채팅 목록
 *   /chats/5          채팅방
 *   /notifications    알림
 *   /admin            관리자
 *   /me               내 정보
 *
 * 알 수 없는 경로는 홈으로 가는 안내를 띄운다.
 */
export default function Routes({ path, me, refreshMe }) {
  const segments = path.split('/').filter(Boolean);

  if (segments.length === 0) return <HomeScreen me={me} />;

  const [head, second] = segments;

  if (head === 'lost' || head === 'found') {
    return second
      ? <PostDetailScreen kind={head} id={second} me={me} />
      : <BoardScreen kind={head} me={me} />;
  }
  if (head === 'my-posts') return <MyPostsScreen me={me} />;
  if (head === 'matches') return <MatchesScreen me={me} />;
  if (head === 'chats') {
    return second
      ? <ChatRoomScreen roomId={second} me={me} onCountsChanged={refreshMe} />
      : <ChatsScreen />;
  }
  if (head === 'notifications') return <NotificationsScreen onCountsChanged={refreshMe} />;
  if (head === 'admin') return <AdminScreen />;
  if (head === 'me') return <ProfileScreen me={me} onRefresh={refreshMe} />;

  return (
    <Empty>
      존재하지 않는 페이지입니다.<br />
      <button className="sm" style={{ marginTop: 12 }} onClick={() => navigate('/')}>홈으로</button>
    </Empty>
  );
}
