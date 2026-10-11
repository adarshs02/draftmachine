import { startHookSide, windowBus } from './bridge'
import { patchWebSocket } from './patch'

// Page world at document_start: patch before ESPN's draft client opens its socket.
patchWebSocket(window, startHookSide(windowBus(window)).emit)
