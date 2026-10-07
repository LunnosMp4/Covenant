import type { CodeConnection } from '../../../shared/code/connection'
import ModalOverlay from '../ui/ModalOverlay'
import CodeConnectionForm from './CodeConnectionForm'

interface CodeConnectionModalProps {
  connection?: CodeConnection
  onClose: () => void
  onSaved: (connectionId: string) => void
}

export default function CodeConnectionModal({
  connection,
  onClose,
  onSaved
}: CodeConnectionModalProps): JSX.Element {
  return (
    <ModalOverlay onClose={onClose} contentClassName="max-w-lg">
      <div className="flex h-[min(560px,calc(100vh-4rem))] flex-col rounded-2xl border border-white/10 bg-neutral-900/95 p-5 shadow-[0_22px_60px_rgba(0,0,0,0.55)]">
        <CodeConnectionForm connection={connection} onClose={onClose} onSaved={onSaved} />
      </div>
    </ModalOverlay>
  )
}
