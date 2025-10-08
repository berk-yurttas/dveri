/**
 * Request Queue Manager
 * Limits the number of concurrent API requests to prevent overwhelming the server
 * and browser connection limits
 */

interface QueuedRequest<T> {
  fn: () => Promise<T>
  resolve: (value: T) => void
  reject: (error: any) => void
}

class RequestQueue {
  private queue: QueuedRequest<any>[] = []
  private activeRequests: number = 0
  private maxConcurrent: number
  
  constructor(maxConcurrent: number = 6) {
    this.maxConcurrent = maxConcurrent
  }

  /**
   * Add a request to the queue
   */
  async enqueue<T>(fn: () => Promise<T>): Promise<T> {
    return new Promise((resolve, reject) => {
      this.queue.push({ fn, resolve, reject })
      this.processQueue()
    })
  }

  /**
   * Process the next request in the queue
   */
  private async processQueue() {
    // If we're at max concurrent requests or queue is empty, wait
    if (this.activeRequests >= this.maxConcurrent || this.queue.length === 0) {
      return
    }

    // Get the next request
    const request = this.queue.shift()
    if (!request) return

    this.activeRequests++

    try {
      const result = await request.fn()
      request.resolve(result)
    } catch (error) {
      request.reject(error)
    } finally {
      this.activeRequests--
      // Process next request in queue
      this.processQueue()
    }
  }

  /**
   * Get the current queue size
   */
  getQueueSize(): number {
    return this.queue.length
  }

  /**
   * Get the number of active requests
   */
  getActiveRequests(): number {
    return this.activeRequests
  }

  /**
   * Clear all pending requests
   */
  clear(): void {
    this.queue.forEach(request => {
      request.reject(new Error('Queue cleared'))
    })
    this.queue = []
  }

  /**
   * Set max concurrent requests
   */
  setMaxConcurrent(max: number): void {
    this.maxConcurrent = max
    // Process queue in case we increased the limit
    this.processQueue()
  }
}

// Global request queue instance
export const requestQueue = new RequestQueue(6) // Default: 6 concurrent requests

/**
 * Wrap a fetch function with request queueing
 */
export function withQueue<T>(fn: () => Promise<T>): Promise<T> {
  return requestQueue.enqueue(fn)
}

