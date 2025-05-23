Real time Leaderboard Service: <br/>
→ P99 latency for Top-K and Rank queries must be < 50 ms.  <br/>
→ Must sustain 10,000 score writes/second and 5,000 leaderboard reads/second per game on a single 4-core node (1M users/game).  <br/>
→ No loss of score data if a node dies.  <br/>
→ Recovery after node failure with full data integrity within ≤ 60 seconds.  <br/>
→ Service process heap memory usage ≤ 512 MB per node.
