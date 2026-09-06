/**
 * 찾아요 / 찾았어요 게시판 (pages/1_찾아요.py, 2_찾았어요.py, 3_내_게시물.py).
 *
 * :kind 는 'lost' 또는 'found'. 두 게시판의 동작이 완전히 대칭이라
 * 라우트도 한 벌만 두고 kind 로 갈라 쓴다 (db.js 의 POST_KINDS 와 짝).
 */
import express from 'express';

import * as db from '../db.js';
import * as ai from '../ai.js';
import * as auth from '../auth.js';
import { filterValue, intOrNull, requireKind, wrap } from '../helpers.js';
import { imageUrlsFor, upload } from '../upload.js';

const router = express.Router();

// 새 습득물이 이 점수 이상으로 맞아떨어질 때만 알린다. 낮추면 알림이 시끄러워지고
// 높이면 놓치므로, 사람이 봤을 때 "관련 있네" 싶은 지점으로 잡았다.
const AUTO_MATCH_MIN_SCORE = 0.35;
const AUTO_MATCH_MAX_NOTIFY = 5;

/**
 * 새 습득물이 올라왔을 때, 아직 물건을 못 찾은 사람들 중 내용이 잘 맞는
 * 사람에게만 "찾으시던 물건이 올라왔어요" 알림을 보낸다.
 *
 * 게시물 등록 응답을 붙잡아 두지 않으려고 등록이 끝난 뒤 따로 돌린다.
 * 여기서 실패해도 게시물은 이미 저장돼 있다.
 */
async function notifyMatchingLosers(foundPostId) {
  const foundPost = db.getPost('found', foundPostId);
  if (!foundPost) return;

  // 아직 찾는 중인 분실 글만 후보로 본다. 이미 찾은 사람에게는 알릴 이유가 없다.
  // 캠퍼스가 다르면 알릴 이유가 없다(서울에서 주운 물건이 용인에서 잃어버린 것일 리 없다).
  const openLostPosts = db.searchPosts('lost', { status: '찾는 중', campus: foundPost.campus })
    .filter((p) => p.user_id !== foundPost.user_id);
  if (!openLostPosts.length) return;

  const ranked = await ai.rankSimilarPosts(foundPost, openLostPosts, AUTO_MATCH_MAX_NOTIFY);
  for (const { post, score } of ranked) {
    if (score < AUTO_MATCH_MIN_SCORE) continue;
    db.createAutoMatchNotification(post.user_id, foundPost, post);
  }
}

/** 목록 + 검색 ("키워드 검색" 탭). 필터를 다 비우면 전체 목록이 된다. */
router.get('/posts/:kind', wrap(async (req, res) => {
  const kind = requireKind(req);
  if (!auth.requireReadyUser(req, res)) return;
  res.json(db.searchPosts(kind, {
    keyword: String(req.query.keyword || '').trim(),
    category: filterValue(req.query.category),
    status: filterValue(req.query.status),
    campus: filterValue(req.query.campus),
  }));
}));

/**
 * 게시물 상세. 여는 김에 조회수도 올린다(1인 1회, 작성자 제외).
 * 조회수 증가가 실패해도 본문은 정상적으로 보여준다 -- 글을 읽는 게 본질이고
 * 카운트는 부수적인 정보라서, 이것 때문에 상세 페이지가 통째로 막히면 안 된다.
 */
router.get('/posts/:kind/:id', wrap(async (req, res) => {
  const kind = requireKind(req);
  const user = auth.requireReadyUser(req, res);
  if (!user) return;
  const postId = intOrNull(req.params.id);
  const post = db.getPost(kind, postId);
  if (!post) {
    res.status(404).json({ error: '선택한 게시물을 찾을 수 없습니다.' });
    return;
  }
  let viewCount = post.view_count;
  try {
    viewCount = db.bumpViewCount(kind, postId, user.id);
  } catch (e) {
    console.error('[views]', e);
  }
  res.json({ ...post, view_count: viewCount });
}));

router.post('/posts/:kind', upload.array('images', db.MAX_POST_IMAGES), wrap(async (req, res) => {
  const kind = requireKind(req);
  const user = auth.requireReadyUser(req, res);
  if (!user) return;

  const { title, description, category, location, at, campus } = req.body;
  // 원본 폼의 "* 필수" 검사와 같은 항목들.
  const errors = [];
  if (!String(title || '').trim()) errors.push('제목을 입력해주세요.');
  if (!String(description || '').trim()) errors.push('설명을 입력해주세요.');
  if (!String(location || '').trim()) errors.push('장소를 입력해주세요.');
  if (!db.CATEGORIES.includes(category)) errors.push('카테고리를 선택해주세요.');
  if (errors.length) throw new db.ValidationError(errors.join(' '));

  const id = db.createPost(kind, {
    userId: user.id,
    title: title.trim(),
    description: description.trim(),
    category,
    location: location.trim(),
    at,
    // 캠퍼스를 안 보내면 글쓴이가 주로 쓰는 캠퍼스로 본다. 대부분 자기 캠퍼스에만
    // 글을 쓰기도 하고, 이 값을 안 보내던 시절의 클라이언트도 그대로 동작한다.
    campus: campus || user.campus,
    imageUrls: imageUrlsFor(req.files),
  });

  // 습득물이 새로 올라오면, 아직 물건을 못 찾은 사람들 중 이 글과 잘 맞는
  // 사람에게만 알린다. 알림 실패가 등록 자체를 되돌리면 안 되므로 따로 감싼다.
  if (kind === 'found') {
    notifyMatchingLosers(id).catch((e) => console.error('[automatch]', e));
  }

  res.status(201).json({ id });
}));

router.patch('/posts/:kind/:id', upload.array('images', db.MAX_POST_IMAGES), wrap(async (req, res) => {
  const kind = requireKind(req);
  const user = auth.requireReadyUser(req, res);
  if (!user) return;

  const fields = {};
  for (const key of ['title', 'description', 'location']) {
    if (req.body[key] !== undefined) {
      const value = String(req.body[key]).trim();
      if (!value) throw new db.ValidationError('제목/설명/장소는 비워둘 수 없습니다.');
      fields[key] = value;
    }
  }
  if (req.body.category !== undefined) {
    if (!db.CATEGORIES.includes(req.body.category)) throw new db.ValidationError('카테고리를 선택해주세요.');
    fields.category = req.body.category;
  }
  if (req.body.campus !== undefined) fields.campus = req.body.campus;
  // 사진을 새로 올렸을 때만 통째로 교체한다 (안 올리면 기존 사진 유지 -- 원본과 동일).
  const newImages = imageUrlsFor(req.files);
  if (newImages.length) {
    fields.image_url = newImages[0];
    fields.image_urls = JSON.stringify(newImages);
  }

  db.updatePost(kind, intOrNull(req.params.id), user.id, fields);
  res.json({ ok: true });
}));

// ---------------------------------------------------------------- 댓글

router.get('/posts/:kind/:id/comments', wrap(async (req, res) => {
  const kind = requireKind(req);
  if (!auth.requireReadyUser(req, res)) return;
  res.json(db.listComments(kind, intOrNull(req.params.id)));
}));

router.post('/posts/:kind/:id/comments', wrap(async (req, res) => {
  const kind = requireKind(req);
  const user = auth.requireReadyUser(req, res);
  if (!user) return;
  const id = db.createComment(kind, intOrNull(req.params.id), user.id, req.body?.content);
  res.status(201).json({ id });
}));

router.delete('/comments/:id', wrap(async (req, res) => {
  const user = auth.requireReadyUser(req, res);
  if (!user) return;
  db.deleteComment(intOrNull(req.params.id), user.id);
  res.json({ ok: true });
}));

router.patch('/posts/:kind/:id/status', wrap(async (req, res) => {
  const kind = requireKind(req);
  const user = auth.requireReadyUser(req, res);
  if (!user) return;
  db.updatePost(kind, intOrNull(req.params.id), user.id, { status: req.body?.status });
  res.json({ ok: true });
}));

router.delete('/posts/:kind/:id', wrap(async (req, res) => {
  const kind = requireKind(req);
  const user = auth.requireReadyUser(req, res);
  if (!user) return;
  db.deletePost(kind, intOrNull(req.params.id), user.id);
  res.json({ ok: true });
}));

/** 내 게시물 화면 (pages/3_내_게시물.py) -- 두 게시판을 한 번에 내려준다. */
router.get('/my/posts', wrap(async (req, res) => {
  const user = auth.requireReadyUser(req, res);
  if (!user) return;
  res.json({
    lost: db.listPostsByUser('lost', user.id),
    found: db.listPostsByUser('found', user.id),
  });
}));

export default router;
