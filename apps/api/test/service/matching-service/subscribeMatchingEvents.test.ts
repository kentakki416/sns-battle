import {
  MatchingEventHandler,
  MatchingEventSubscriber,
} from "../../../src/repository/redis"
import {
  MatchingSseEvent,
  subscribeMatchingEvents,
} from "../../../src/service/matching-service"

/**
 * subscribe された handler を 1 件だけ覚えておく fake。
 */
const buildFakeSubscriber = () => {
  let captured: MatchingEventHandler | null = null
  const subscribe = jest.fn(async (_userId: number, handler: MatchingEventHandler) => {
    captured = handler
  })
  const unsubscribe = jest.fn(async () => {
    captured = null
  })
  const subscriber: MatchingEventSubscriber = { subscribe, unsubscribe }
  return {
    deliver: (payload: string) => {
      if (captured) captured(payload)
    },
    isSubscribed: () => captured !== null,
    subscriber,
    subscribeMock: subscribe,
    unsubscribeMock: unsubscribe,
  }
}

/**
 * サブスクライブ完了 (subscribe の Promise が解決) するまで待つ
 */
const waitForSubscribe = async () =>
  new Promise((resolve) => setTimeout(resolve, 10))

describe("subscribeMatchingEvents", () => {
  it("Pub/Sub で受け取った payload を onEvent に渡す", async () => {
    const ctx = buildFakeSubscriber()
    const ac = new AbortController()
    const events: MatchingSseEvent[] = []

    const subscribePromise = subscribeMatchingEvents(
      1,
      ac.signal,
      (ev) => events.push(ev),
      { matchingEventSubscriber: ctx.subscriber },
    )

    await waitForSubscribe()

    ctx.deliver(
      JSON.stringify({
        livekit_room_name: "matching:7",
        peer: { avatar_url: null, id: 2, name: "Peer" },
        session_id: 7,
        type: "matched",
      }),
    )
    ctx.deliver(JSON.stringify({ ts: 1234, type: "heartbeat" }))

    expect(events).toEqual([
      {
        livekit_room_name: "matching:7",
        peer: { avatar_url: null, id: 2, name: "Peer" },
        session_id: 7,
        type: "matched",
      },
      { ts: 1234, type: "heartbeat" },
    ])

    ac.abort()
    await subscribePromise
  })

  it("heartbeatIntervalMs ごとに heartbeat を onEvent に渡す", async () => {
    const ctx = buildFakeSubscriber()
    const ac = new AbortController()
    const events: MatchingSseEvent[] = []

    const subscribePromise = subscribeMatchingEvents(
      1,
      ac.signal,
      (ev) => events.push(ev),
      { matchingEventSubscriber: ctx.subscriber },
      { heartbeatIntervalMs: 30 },
    )

    /** 約 100ms 待機して 3 件以上の heartbeat が来るのを待つ */
    await new Promise((resolve) => setTimeout(resolve, 110))
    ac.abort()
    await subscribePromise

    expect(events.length).toBeGreaterThanOrEqual(3)
    for (const ev of events) {
      expect(ev.type).toBe("heartbeat")
    }
  })

  it("abort で Promise が resolve し、unsubscribe が呼ばれる", async () => {
    const ctx = buildFakeSubscriber()
    const ac = new AbortController()

    const subscribePromise = subscribeMatchingEvents(
      42,
      ac.signal,
      () => {
        /** 本テストではイベントを受けない */
      },
      { matchingEventSubscriber: ctx.subscriber },
    )

    await waitForSubscribe()
    expect(ctx.subscribeMock).toHaveBeenCalledWith(42, expect.any(Function))

    ac.abort()
    await subscribePromise

    expect(ctx.unsubscribeMock).toHaveBeenCalledWith(42, expect.any(Function))
    expect(ctx.isSubscribed()).toBe(false)
  })

  it("不正な JSON は無視する（Promise が reject しない）", async () => {
    const ctx = buildFakeSubscriber()
    const ac = new AbortController()
    const events: MatchingSseEvent[] = []

    const subscribePromise = subscribeMatchingEvents(
      1,
      ac.signal,
      (ev) => events.push(ev),
      { matchingEventSubscriber: ctx.subscriber },
    )

    await waitForSubscribe()

    ctx.deliver("not-a-json")
    ctx.deliver(JSON.stringify({ ts: 999, type: "heartbeat" }))

    expect(events).toEqual([{ ts: 999, type: "heartbeat" }])

    ac.abort()
    await subscribePromise
  })

  it("既に abort 済みの signal でも安全に終了する", async () => {
    const ctx = buildFakeSubscriber()
    const ac = new AbortController()
    ac.abort()

    await subscribeMatchingEvents(
      1,
      ac.signal,
      () => {
        /** 受けない */
      },
      { matchingEventSubscriber: ctx.subscriber },
    )

    expect(ctx.unsubscribeMock).toHaveBeenCalled()
  })
})
