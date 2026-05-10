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
 * generator から N 件取得する。N に達したら break する。
 */
const collectN = async (
  iter: AsyncGenerator<MatchingSseEvent>,
  n: number,
): Promise<MatchingSseEvent[]> => {
  const out: MatchingSseEvent[] = []
  for await (const ev of iter) {
    out.push(ev)
    if (out.length >= n) break
  }
  return out
}

describe("subscribeMatchingEvents", () => {
  it("Pub/Sub で受け取った payload を yield する", async () => {
    const ctx = buildFakeSubscriber()
    const ac = new AbortController()
    const iter = subscribeMatchingEvents(1, ac.signal, {
      matchingEventSubscriber: ctx.subscriber,
    })

    /** for await を起動してから subscribe → handler 登録 → deliver の順にしないと取りこぼす */
    const eventsPromise = collectN(iter, 2)

    /** subscribe の Promise が解決して handler が captured されるのを待つ */
    await new Promise((resolve) => setTimeout(resolve, 10))

    ctx.deliver(
      JSON.stringify({
        livekit_room_name: "matching:7",
        peer: { avatar_url: null, id: 2, name: "Peer" },
        session_id: 7,
        type: "matched",
      }),
    )
    ctx.deliver(JSON.stringify({ ts: 1234, type: "heartbeat" }))

    const events = await eventsPromise
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
  })

  it("heartbeatIntervalMs ごとに heartbeat を yield する", async () => {
    const ctx = buildFakeSubscriber()
    const ac = new AbortController()
    const iter = subscribeMatchingEvents(
      1,
      ac.signal,
      { matchingEventSubscriber: ctx.subscriber },
      { heartbeatIntervalMs: 30 },
    )

    const events = await collectN(iter, 3)
    expect(events).toHaveLength(3)
    for (const ev of events) {
      expect(ev.type).toBe("heartbeat")
    }
    ac.abort()
  })

  it("abort で generator が完了し、unsubscribe が呼ばれる", async () => {
    const ctx = buildFakeSubscriber()
    const ac = new AbortController()
    const iter = subscribeMatchingEvents(42, ac.signal, {
      matchingEventSubscriber: ctx.subscriber,
    })

    /** generator を起動 → subscribe 呼び出し → wakeup 待機 */
    const drain = (async () => {
      for await (const ev of iter) {
        /** abort で抜ける想定。ev は使わない */
        void ev
      }
    })()
    /** subscribe の async 完了を待つ */
    await new Promise((resolve) => setTimeout(resolve, 10))
    expect(ctx.subscribeMock).toHaveBeenCalledWith(42, expect.any(Function))

    ac.abort()
    await drain
    expect(ctx.unsubscribeMock).toHaveBeenCalledWith(42, expect.any(Function))
    expect(ctx.isSubscribed()).toBe(false)
  })

  it("不正な JSON は無視する（generator が落ちない）", async () => {
    const ctx = buildFakeSubscriber()
    const ac = new AbortController()
    const iter = subscribeMatchingEvents(1, ac.signal, {
      matchingEventSubscriber: ctx.subscriber,
    })

    const eventsPromise = collectN(iter, 1)
    await new Promise((resolve) => setTimeout(resolve, 10))

    ctx.deliver("not-a-json")
    ctx.deliver(JSON.stringify({ ts: 999, type: "heartbeat" }))

    const events = await eventsPromise
    expect(events).toEqual([{ ts: 999, type: "heartbeat" }])
    ac.abort()
  })
})
