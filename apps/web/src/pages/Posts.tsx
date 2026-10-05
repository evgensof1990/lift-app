import PostsBoard from "../components/Posts";
import VkConnect from "../components/VkConnect";

const URLS = { list: "/api/posts", create: "/api/posts", item: (id: number) => `/api/posts/${id}`, files: "/api/files" };

export default function Posts() {
  return (
    <div className="page">
      <div>
        <h1 className="h1">Посты</h1>
        <p className="muted">Один пост — сразу во все ваши соцсети, сейчас или по расписанию</p>
      </div>
      <VkConnect />
      <PostsBoard urls={URLS} emptyChannelsHint="Соцсети ещё не подключены. ВКонтакте можно подключить выше, остальные подключит команда. Пока можно готовить черновики." />
    </div>
  );
}
