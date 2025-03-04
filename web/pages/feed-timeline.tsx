import { usePrivateUser, useUser } from 'web/hooks/use-user'
import { Col } from 'web/components/layout/col'
import { Row } from 'web/components/layout/row'
import { LoadingIndicator } from 'web/components/widgets/loading-indicator'
import clsx from 'clsx'
import { track } from 'web/lib/service/analytics'
import Router from 'next/router'
import { ArrowUpIcon, PencilAltIcon } from '@heroicons/react/solid'
import { VisibilityObserver } from 'web/components/widgets/visibility-observer'
import { SiteLink } from 'web/components/widgets/site-link'
import { FeedTimelineItem, useFeedTimeline } from 'web/hooks/use-feed-timeline'
import { FeedTimelineItems } from 'web/components/feed/feed-timeline-items'
import { useIsPageVisible } from 'web/hooks/use-page-visible'
import { useEffect, useState } from 'react'
import { usePersistentLocalState } from 'web/hooks/use-persistent-local-state'
import { Avatar } from 'web/components/widgets/avatar'
import { uniq } from 'lodash'
import { filterDefined } from 'common/util/array'
import { usePersistentInMemoryState } from 'web/hooks/use-persistent-in-memory-state'
import { Contract } from 'common/contract'
import { db } from 'web/lib/supabase/db'
import { Page } from 'web/components/layout/page'
import { MINUTE_MS } from 'common/util/time'

export default function FeedTimelinePage() {
  return (
    <Page>
      <FeedTimeline />
    </Page>
  )
}
export function FeedTimeline() {
  return (
    <Col className="mx-auto w-full max-w-2xl gap-2 pb-4 sm:px-2 lg:pr-4">
      <Col className={clsx('gap-6')}>
        <Col>
          <FeedTimelineContent />
          <button
            type="button"
            className={clsx(
              'focus:ring-primary-500 fixed  right-3 z-20 inline-flex items-center rounded-full border  border-transparent  p-4 shadow-sm focus:outline-none focus:ring-2 focus:ring-offset-2 lg:hidden',
              'disabled:bg-ink-300 text-ink-0 from-primary-500 hover:from-primary-700 to-blue-500 hover:to-blue-700 enabled:bg-gradient-to-r',
              'bottom-[64px]'
            )}
            onClick={() => {
              Router.push('/create')
              track('mobile create button')
            }}
          >
            <PencilAltIcon className="h-6 w-6" aria-hidden="true" />
          </button>
        </Col>
      </Col>
    </Col>
  )
}
function FeedTimelineContent() {
  const user = useUser()
  const privateUser = usePrivateUser()
  const {
    boosts,
    checkForNewer,
    addTimelineItems,
    savedFeedItems,
    loadMoreOlder,
  } = useFeedTimeline(user, privateUser, 'feed-timeline')
  const pageVisible = useIsPageVisible()
  const [lastSeen, setLastSeen] = usePersistentLocalState(
    Date.now(),
    'last-seen-feed-timeline' + user?.id
  )
  const [manualContracts, setManualContracts] = usePersistentInMemoryState<
    Contract[] | undefined
  >(undefined, `new-interesting-contracts-${user?.id}-feed-timeline`)

  const [topIsVisible, setTopIsVisible] = useState(false)
  const [newerTimelineItems, setNewerTimelineItems] = useState<
    FeedTimelineItem[]
  >([])
  const [loadingMore, setLoadingMore] = useState(false)
  const checkForNewerFeedItems = async () => {
    return await checkForNewer()
  }

  // This queries for new items if they haven't looked at the page in a while like twitter
  useEffect(() => {
    if (newerTimelineItems.length > 0) return
    const now = Date.now()
    if (pageVisible && now - lastSeen > MINUTE_MS)
      checkForNewerFeedItems().then(setNewerTimelineItems)
    if (!pageVisible) setLastSeen(now)
    return () => setLastSeen(Date.now())
  }, [pageVisible])

  // This queries for new items if they scroll to the top
  useEffect(() => {
    if (newerTimelineItems.length > 0) return
    const now = Date.now()
    if (topIsVisible && now - lastSeen > 10000) {
      setLoadingMore(true)
      checkForNewerFeedItems().then((newerTimelineItems) => {
        addTimelineItems(newerTimelineItems, { new: true })
        setLoadingMore(false)
      })
    }
    if (!topIsVisible) setLastSeen(now)
    return () => setLastSeen(Date.now())
  }, [topIsVisible])

  if (!boosts || !savedFeedItems) return <LoadingIndicator />
  const newAvatarUrls = uniq(
    filterDefined(newerTimelineItems.map((item) => item.avatarUrl))
  ).slice(0, 3)
  const fetchMoreOlderContent = async () => {
    const moreFeedItems = await loadMoreOlder()
    if (!moreFeedItems && user) {
      const excludedContractIds = savedFeedItems
        .map((i) => i.contractId)
        .concat(manualContracts?.map((c) => c.id) ?? [])
      const { data } = await db.rpc(
        'get_recommended_contracts_embeddings_fast',
        {
          uid: user.id,
          n: 20,
          excluded_contract_ids: filterDefined(excludedContractIds),
        }
      )

      setManualContracts((data ?? []).map((row: any) => row.data as Contract))
    }
  }

  return (
    <Col className={'relative w-full gap-6'}>
      <VisibilityObserver
        className="pointer-events-none absolute top-0 h-5 w-full select-none "
        onVisibilityUpdated={(visible) => {
          if (visible && !topIsVisible) {
            addTimelineItems(newerTimelineItems, { new: true })
            setNewerTimelineItems([])
            setTopIsVisible(true)
          }
          if (!visible) setTopIsVisible(false)
        }}
      />
      {newAvatarUrls.length > 2 && !topIsVisible && (
        <NewActivityButton
          avatarUrls={newAvatarUrls}
          onClick={() => setLastSeen(Date.now)}
        />
      )}

      {loadingMore && (
        <Row className={'my-1 mb-2 justify-center'}>
          <LoadingIndicator />
        </Row>
      )}
      <FeedTimelineItems
        boosts={boosts}
        user={user}
        feedTimelineItems={savedFeedItems}
        manualContracts={manualContracts}
      />
      <div className="relative">
        <VisibilityObserver
          className="pointer-events-none absolute bottom-0 h-screen w-full select-none"
          onVisibilityUpdated={(visible) => visible && fetchMoreOlderContent()}
        />
      </div>

      {savedFeedItems.length === 0 && (
        <div className="text-ink-1000 m-4 flex w-full flex-col items-center justify-center">
          We're fresh out of cards!
          <SiteLink
            href="/questions?s=newest&f=open"
            className="text-primary-700"
          >
            Browse new questions
          </SiteLink>
        </div>
      )}
    </Col>
  )
}

const NewActivityButton = (props: {
  avatarUrls: string[]
  onClick: () => void
}) => {
  const { avatarUrls, onClick } = props
  const scrollToTop = () => {
    onClick()
    window.scrollTo({
      top: 0,
      behavior: 'smooth',
    })
  }

  return (
    <button
      className={clsx(
        'bg-canvas-50 border-ink-200 hover:bg-ink-200 rounded-full border-2 py-2 pr-3 pl-2 text-sm transition-colors',
        'sticky top-7 z-20 self-center'
      )}
      onClick={scrollToTop}
    >
      <Row className="text-ink-600 items-center ">
        <ArrowUpIcon className="text-ink-400 mr-3 h-5 w-5" />
        {avatarUrls.map((url) => (
          <Avatar
            key={url + 'new-feed-activity-button'}
            size={'xs'}
            className={'-ml-2'}
            avatarUrl={url}
          />
        ))}
        <div className="ml-1">New updates</div>
      </Row>
    </button>
  )
}
