export default function ServerDrawer({ id }: { id: string }) {
  return <aside className="fixed right-3 top-20 z-40 rounded-card border border-line bg-surface p-4">Server {id}</aside>;
}
