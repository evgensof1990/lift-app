import PostsBoard from "../components/Posts";

const URLS = { list: "/api/posts", create: "/api/posts", item: (id: number) => `/api/posts/${id}`, files: "/api/files" };

export default function Posts() {
  return (
    <div className="page">
      <div>
        <h1 className="h1">Посты</h1>
        <p className="muted">Один пост — сразу во все ваши соцсети, сейчас или по расписанию</p>
      </div>
      <PostsBoard urls={URLS} emptyChannelsHint="Соцсети ещё не подключены — команда сделает это за вас. Пока можно готовить черновики." />
    </div>
  );
}
