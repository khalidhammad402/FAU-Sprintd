export default function TaskDrawer({ id }: { id: string }) {
  return <aside className="fixed right-3 top-20 z-40 rounded-card border border-line bg-surface p-4">Task {id}</aside>;
}
