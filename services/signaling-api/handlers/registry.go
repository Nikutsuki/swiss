package handlers

import (
	"sync"

	"github.com/gorilla/websocket"
)

type peerConn struct {
	conn    *websocket.Conn
	writeMu sync.Mutex
	peerID  string
}

type registry struct {
	mu    sync.RWMutex
	peers map[string]*peerConn
}

func newRegistry() *registry {
	return &registry{peers: make(map[string]*peerConn)}
}

func (r *registry) register(pc *peerConn) (old *peerConn) {
	r.mu.Lock()
	defer r.mu.Unlock()
	old = r.peers[pc.peerID]
	r.peers[pc.peerID] = pc
	return old
}

func (r *registry) unregister(peerID string, pc *peerConn) {
	r.mu.Lock()
	defer r.mu.Unlock()
	current, ok := r.peers[peerID]
	if ok && current == pc {
		delete(r.peers, peerID)
	}
}

func (r *registry) lookup(peerID string) *peerConn {
	r.mu.RLock()
	defer r.mu.RUnlock()
	return r.peers[peerID]
}
