import { ref, shallowRef } from 'vue'

import { withNodeAddSource } from '@/platform/telemetry/nodeAdded/nodeAddSource'
import { useCanvasStore } from '@/renderer/core/canvas/canvasStore'
import { useLitegraphService } from '@/services/litegraphService'
import type { ComfyNodeDefImpl } from '@/stores/nodeDefStore'

type DragMode = 'click' | 'native'

const isDragging = ref(false)
const draggedNode = shallowRef<ComfyNodeDefImpl | null>(null)
const cursorPosition = ref({ x: 0, y: 0 })
const dragMode = ref<DragMode>('click')
const lastNativeDragPosition = shallowRef<{ x: number; y: number }>()
let listenersSetup = false

function updatePosition(e: PointerEvent) {
  cursorPosition.value = { x: e.clientX, y: e.clientY }
}

// Firefox dragend can report stale clientX/Y and `drag` can fire with
// (0, 0). dragover on the target reliably reports real client coords.
// https://bugzilla.mozilla.org/show_bug.cgi?id=1773886
function trackNativeDragPosition(e: DragEvent) {
  if (dragMode.value !== 'native') return
  if (e.clientX === 0 && e.clientY === 0) return
  lastNativeDragPosition.value = { x: e.clientX, y: e.clientY }
}

function cancelDrag() {
  if (isDragging.value) useCanvasStore().isGhostPlacing = false
  isDragging.value = false
  draggedNode.value = null
  dragMode.value = 'click'
  lastNativeDragPosition.value = undefined
}

function isOverCanvas(clientX: number, clientY: number): boolean {
  const canvasElement = useCanvasStore().canvas?.canvas as
    | HTMLCanvasElement
    | undefined
  if (!canvasElement) return false
  const rect = canvasElement.getBoundingClientRect()
  return (
    clientX >= rect.left &&
    clientX <= rect.right &&
    clientY >= rect.top &&
    clientY <= rect.bottom
  )
}

// The canvas is full-bleed and sidebar/properties panels are pointer-events-auto
// overlays painted on top of it, so a point inside the canvas rect can still be
// over a panel. Hit-test the actual event target instead, mirroring how native
// drag treats the canvas as its only drop target: releasing over a panel cancels.
function isCanvasTarget(target: EventTarget | null): boolean {
  const canvasElement = useCanvasStore().canvas?.canvas
  return (
    !!canvasElement && target instanceof Node && canvasElement.contains(target)
  )
}

function addNodeAtPosition(clientX: number, clientY: number): boolean {
  const nodeDef = draggedNode.value
  if (!nodeDef) return false
  const canvas = useCanvasStore().canvas
  if (!canvas) return false
  if (!isOverCanvas(clientX, clientY)) return false

  const pos = canvas.convertEventToCanvasOffset({
    clientX,
    clientY
  } as PointerEvent)
  const node = withNodeAddSource('sidebar_drag', () =>
    useLitegraphService().addNodeOnGraph(nodeDef, { pos })
  )
  if (node) canvas.selectItems([node])
  return true
}

function endDrag(e: PointerEvent) {
  if (!isDragging.value || !draggedNode.value) return
  if (dragMode.value !== 'click') return

  try {
    if (isCanvasTarget(e.target)) addNodeAtPosition(e.clientX, e.clientY)
  } finally {
    cancelDrag()
  }
}

function handleKeydown(e: KeyboardEvent) {
  if (e.key === 'Escape') cancelDrag()
}

// Prevent LiteGraph's empty-canvas hit-test from deselecting the placed node on pointerup.
function blockCommitPointerDown(e: PointerEvent) {
  if (!isDragging.value || dragMode.value !== 'click') return
  if (!isCanvasTarget(e.target)) return
  e.stopImmediatePropagation()
}

function setupGlobalListeners() {
  if (listenersSetup) return
  listenersSetup = true

  document.addEventListener('pointermove', updatePosition)
  document.addEventListener('pointerdown', blockCommitPointerDown, true)
  document.addEventListener('pointerup', endDrag, true)
  document.addEventListener('keydown', handleKeydown)
  document.addEventListener('dragover', trackNativeDragPosition)
}

function cleanupGlobalListeners() {
  if (!listenersSetup) return
  listenersSetup = false

  document.removeEventListener('pointermove', updatePosition)
  document.removeEventListener('pointerdown', blockCommitPointerDown, true)
  document.removeEventListener('pointerup', endDrag, true)
  document.removeEventListener('keydown', handleKeydown)
  document.removeEventListener('dragover', trackNativeDragPosition)

  if (isDragging.value) {
    cancelDrag()
  }
}

export function useNodeDragToCanvas() {
  function startDrag(nodeDef: ComfyNodeDefImpl, mode: DragMode = 'click') {
    isDragging.value = true
    draggedNode.value = nodeDef
    dragMode.value = mode
    // Reuse the litegraph ghost-placement flag: Vue nodes render inert while
    // it is set, so the release hit-tests the canvas instead of an existing
    // node's DOM and placement over occupied areas isn't silently cancelled.
    useCanvasStore().isGhostPlacing = true
  }

  function handleNativeDrop(clientX: number, clientY: number) {
    if (dragMode.value !== 'native') return
    const tracked = lastNativeDragPosition.value
    try {
      addNodeAtPosition(tracked?.x ?? clientX, tracked?.y ?? clientY)
    } finally {
      cancelDrag()
    }
  }

  return {
    isDragging,
    draggedNode,
    cursorPosition,
    dragMode,
    startDrag,
    cancelDrag,
    handleNativeDrop,
    setupGlobalListeners,
    cleanupGlobalListeners
  }
}
