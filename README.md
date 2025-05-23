Real time Leaderboard Service >
→ P99 latency for Top-K and Rank queries must be < 50 ms.  
→ Must sustain 10,000 score writes/second and 5,000 leaderboard reads/second per game on a single 4-core node (1M users/game).  
→ No loss of score data if a node dies.  
→ Recovery after node failure with full data integrity within ≤ 60 seconds.  
→ Service process heap memory usage ≤ 512 MB per node.
