import http from 'k6/http';
import { check, sleep } from 'k6';
import { Rate, Trend } from 'k6/metrics';

// Custom metrics
const errorRate = new Rate('errors');
const scoreIngestionDuration = new Trend('score_ingestion_duration');
const leaderboardReadDuration = new Trend('leaderboard_read_duration');

const BASE_URL = 'http://localhost:8090';

// Test configuration
export const options = {
  scenarios: {
    // Functional test - basic validation
    functional_test: {
      executor: 'constant-vus',
      vus: 5,
      duration: '30s',
      tags: { test_type: 'functional' },
      exec: 'functionalTest',
    },
    
    // Performance test - score ingestion (10k writes/sec)
    score_ingestion_load: {
      executor: 'constant-arrival-rate',
      rate: 10000, // 10k requests per second
      timeUnit: '1s',
      duration: '2m',
      preAllocatedVUs: 200,
      maxVUs: 500,
      tags: { test_type: 'score_ingestion' },
      exec: 'scoreIngestionTest',
      startTime: '35s', // Start after functional test
    },
    
    // Performance test - leaderboard reads (5k reads/sec)
    leaderboard_read_load: {
      executor: 'constant-arrival-rate',
      rate: 5000, // 5k requests per second
      timeUnit: '1s',
      duration: '2m',
      preAllocatedVUs: 100,
      maxVUs: 200,
      tags: { test_type: 'leaderboard_read' },
      exec: 'leaderboardReadTest',
      startTime: '35s', // Start after functional test
    },
    
    // Stress test - combined load
    combined_stress: {
      executor: 'ramping-arrival-rate',
      startRate: 1000,
      timeUnit: '1s',
      preAllocatedVUs: 100,
      maxVUs: 300,
      stages: [
        { duration: '30s', target: 5000 }, // Ramp up to 5k/sec
        { duration: '1m', target: 8000 },  // Increase to 8k/sec
        { duration: '1m', target: 12000 }, // Peak at 12k/sec
        { duration: '30s', target: 5000 }, // Ramp down
      ],
      tags: { test_type: 'stress' },
      exec: 'combinedStressTest',
      startTime: '4m', // Start after other tests
    }
  },
  
  thresholds: {
    // Performance requirements
    'http_req_duration{test_type:score_ingestion}': ['p(99)<50'], // p99 < 50ms
    'http_req_duration{test_type:leaderboard_read}': ['p(99)<50'], // p99 < 50ms
    'http_req_duration{test_type:stress}': ['p(99)<100'], // Relaxed for stress test
    
    // Error rates
    'errors{test_type:score_ingestion}': ['rate<0.01'], // <1% error rate
    'errors{test_type:leaderboard_read}': ['rate<0.01'], // <1% error rate
    'errors{test_type:stress}': ['rate<0.05'], // <5% error rate for stress
    
    // Success rates
    'http_req_failed{test_type:score_ingestion}': ['rate<0.01'],
    'http_req_failed{test_type:leaderboard_read}': ['rate<0.01'],
    
    // Request rates validation
    'http_reqs{test_type:score_ingestion}': ['rate>=9500'], // Allow 5% tolerance
    'http_reqs{test_type:leaderboard_read}': ['rate>=4750'],
  }
};

// Generate realistic test data
function generateUserId() {
  return `user_${Math.floor(Math.random() * 1000000)}`; // 1M users
}

function generateGameId() {
  const games = ['game1', 'game2', 'game3', 'puzzle_master', 'arcade_hero'];
  return games[Math.floor(Math.random() * games.length)];
}

function generateScore() {
  return Math.floor(Math.random() * 1000000); // Scores 0-1M
}

// Functional test - validates basic endpoint functionality
export function functionalTest() {
  const gameId = 'test_game';
  const userId = 'test_user_123';
  
  // Test 1: Valid score submission
  const scorePayload = {
    user_id: userId,
    game_id: gameId,
    score: 12345
  };
  
  const scoreResponse = http.post(
    `${BASE_URL}/leaderboard/v1/score`,
    JSON.stringify(scorePayload),
    {
      headers: { 'Content-Type': 'application/json' },
      tags: { test_type: 'functional', operation: 'score_submit' }
    }
  );
  
  check(scoreResponse, {
    'score submission returns 202': (r) => r.status === 202,
    'score submission has correct response': (r) => {
      const body = JSON.parse(r.body);
      return body.status === 'accepted' && body.message === 'Score is being processed';
    }
  });
  
  // Test 2: Invalid payload (missing fields)
  const invalidPayload = {
    user_id: userId,
    // missing game_id and score
  };
  
  const invalidResponse = http.post(
    `${BASE_URL}/leaderboard/v1/score`,
    JSON.stringify(invalidPayload),
    {
      headers: { 'Content-Type': 'application/json' },
      tags: { test_type: 'functional', operation: 'invalid_submit' }
    }
  );
  
  check(invalidResponse, {
    'invalid submission returns 400': (r) => r.status === 400,
    'invalid submission has error message': (r) => {
      const body = JSON.parse(r.body);
      return body.error && body.error.includes('Missing required fields');
    }
  });
  
  // Test 3: Leaderboard read (assuming you have a GET endpoint)
  const leaderboardResponse = http.get(
    `${BASE_URL}/leaderboard/v1/leaderboard/${gameId}?limit=10`,
    {
      tags: { test_type: 'functional', operation: 'leaderboard_read' }
    }
  );
  
  check(leaderboardResponse, {
    'leaderboard read returns 200 or 404': (r) => r.status === 200 || r.status === 404,
  });
  
  sleep(0.1);
}

// Score ingestion performance test
export function scoreIngestionTest() {
  const payload = {
    user_id: generateUserId(),
    game_id: generateGameId(),
    score: generateScore()
  };
  
  const response = http.post(
    `${BASE_URL}/leaderboard/v1/score`,
    JSON.stringify(payload),
    {
      headers: { 'Content-Type': 'application/json' },
      tags: { test_type: 'score_ingestion' }
    }
  );
  
  const success = check(response, {
    'status is 202': (r) => r.status === 202,
    'response time < 100ms': (r) => r.timings.duration < 100,
  });
  
  errorRate.add(!success);
  scoreIngestionDuration.add(response.timings.duration);
}

// Leaderboard read performance test
export function leaderboardReadTest() {
  const gameId = generateGameId();
  const limit = Math.floor(Math.random() * 50) + 10; // 10-60 results
  
  const response = http.get(
    `${BASE_URL}/leaderboard/v1/leaderboard/${gameId}?limit=${limit}`,
    {
      tags: { test_type: 'leaderboard_read' }
    }
  );
  
  const success = check(response, {
    'status is 200 or 404': (r) => r.status === 200 || r.status === 404,
    'response time < 100ms': (r) => r.timings.duration < 100,
  });
  
  errorRate.add(!success);
  leaderboardReadDuration.add(response.timings.duration);
}

// Combined stress test
export function combinedStressTest() {
  const random = Math.random();
  
  // 70% writes, 30% reads (realistic ratio)
  if (random < 0.7) {
    const payload = {
      user_id: generateUserId(),
      game_id: generateGameId(),
      score: generateScore()
    };
    
    const response = http.post(
      `${BASE_URL}/leaderboard/v1/score`,
      JSON.stringify(payload),
      {
        headers: { 'Content-Type': 'application/json' },
        tags: { test_type: 'stress', operation: 'write' }
      }
    );
    
    check(response, {
      'write status acceptable': (r) => r.status === 202 || r.status === 503,
    });
  } else {
    const gameId = generateGameId();
    const response = http.get(
      `${BASE_URL}/leaderboard/v1/leaderboard/${gameId}?limit=20`,
      {
        tags: { test_type: 'stress', operation: 'read' }
      }
    );
    
    check(response, {
      'read status acceptable': (r) => r.status === 200 || r.status === 404 || r.status === 503,
    });
  }
}

// Setup function - runs once before all tests
export function setup() {
  console.log('Starting leaderboard performance tests...');
  console.log('Target: 10k writes/sec, 5k reads/sec, p99 < 50ms');
  
  // Warm up the service
  http.post(
    `${BASE_URL}/leaderboard/v1/score`,
    JSON.stringify({
      user_id: 'warmup_user',
      game_id: 'warmup_game',
      score: 1000
    }),
    {
      headers: { 'Content-Type': 'application/json' }
    }
  );
  
  return { startTime: new Date() };
}

// Teardown function - runs once after all tests
export function teardown(data) {
  const duration = (new Date() - data.startTime) / 1000;
  console.log(`\nTest completed in ${duration} seconds`);
  console.log('Check the results above for performance metrics');
}