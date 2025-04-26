import type { ComponentType, ForwardedRef, ReactElement, Ref } from 'react';
import React, {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import type {
  CellRendererProps,
  FlatListProps,
  ListRenderItem,
  NativeSyntheticEvent,
  NativeTouchEvent,
  ViewabilityConfigCallbackPairs,
} from 'react-native';
import {
  Animated,
  Dimensions,
  FlatList,
  PanResponder,
  View,
} from 'react-native';
import { DraggableMasonryGridCardWrapper } from './CardWrapper';
import type {
  DraggableGridCardRef,
  DraggableItem,
  DraggableMasonryGridCardWrapperRef,
  DraggableMasonryGridListData,
  DraggableMasonryGridListItem,
  DraggableMasonryGridListRef,
  Vertices,
} from './types';
import {
  arrayMoveFromIndexToIndex,
  checkIfContainsCoordinates,
  getGridColumns,
  getViewVertices,
  useStateRef,
} from './utils';

const REARRANGE_ANIMATION_DURATION_MS = 200;
const DRAGGED_ITEM_SCALE = 1.2;
const AUTO_SCROLL_VELOCITY = 0.5;

const AUTO_SCROLL_MAYBE_LOADED_MORE_CLIPS_CHECK_POLL_MS = 500;
const REARRANGE_CHECK_THROTTLE_MS = 100;
const WAIT_FOR_RESPONDER_TRANSFER_MS = 200;
const WINDOW_SIZE_CHECK_THROTTLE_MS = 200;

const WINDOW_HEIGHT = Dimensions.get('window').height;

type DraggableMasonryGridListProps<T> = Omit<
  FlatListProps<DraggableMasonryGridListData<T>[]>,
  | 'data'
  | 'getItemLayout'
  | 'keyExtractor'
  | 'onScroll'
  | 'renderItem'
  | 'scrollEventThrottle'
> & {
  columnViewabilityConfigCallbackPairs?: ViewabilityConfigCallbackPairs[];
  columnWidth: number;
  data: DraggableItem<T>[];
  keyExtractor: (item: DraggableMasonryGridListItem<T>) => string;
  onRearrange(rearrangedData: DraggableItem<T>[]): void;
  onScroll?(offsetY: number): void;
  renderItem(
    item: DraggableMasonryGridListItem<T>,
    drag: () => void,
    dragRelease: () => void
  ): ReactElement | null;
  /**
   * This controls how often the scroll event will be fired while scrolling (as a time interval in ms).
   * A lower number yields better accuracy for code that is tracking the scroll position,
   * but can lead to scroll performance problems due to the volume of information being sent over the bridge.
   * The default value is zero, which means the scroll event will be sent every time the view is scrolled.
   */
  scrollEventThrottle?: number;
  viewPostOffsets?: {
    top?: number;
    bottom?: number;
  };
  wobble?: boolean;
};

/**
 * Notes:
 * - Does not support sticky headers yet
 */
function GridList<T>(
  props: DraggableMasonryGridListProps<T>,
  ref: Ref<DraggableMasonryGridListRef>
) {
  /*----------------------------- extract data -----------------------------*/
  const initialNumToRender = props.initialNumToRender ?? 5;
  const numberOfColumns = props.numColumns ?? 2;
  const onEndReachedThreshold = props.onEndReachedThreshold ?? 0;
  const windowSize = props.windowSize ?? 21;

  const propsRef = useRef(props);
  propsRef.current = props;

  const [rearrangedRawData, setRearrangedRawData] = useState(props.data);
  useLayoutEffect(() => setRearrangedRawData(props.data), [props.data]);

  const { columnsForGrid, gridDataInSequence, columnHeights } = useMemo(
    () => getGridColumns(rearrangedRawData, numberOfColumns, props.columnWidth),
    [rearrangedRawData, numberOfColumns, props.columnWidth]
  );
  const gridDataInSequenceRef = useRef(gridDataInSequence);
  gridDataInSequenceRef.current = gridDataInSequence;

  const gridItemsCombinedHeight = useMemo(
    () => Math.max(...columnHeights),
    [...columnHeights]
  );

  const rearrangeCacheRef = useRef({
    columnsForGrid,
    columnHeights,
    gridDataInSequence,
    rawDataInSequence: rearrangedRawData,
  });

  /*----------------------------- declare states and refs -----------------------------*/
  const flatListHeightRef = useRef(WINDOW_HEIGHT);
  const headerHeightRef = useRef(0);
  const listContentHeightRef = useRef(0);
  listContentHeightRef.current =
    gridItemsCombinedHeight + headerHeightRef.current;

  const onTouchResponderGrantPageYRef = useRef(0);
  const onTouchResponderGrantScrollYRef = useRef(0);

  const listRef = useRef<FlatList>(null);
  const listScrollOffsetRef = useRef(0);

  const topScrollOffsetRef = useRef(0);
  const bottomScrollOffsetRef = useRef(0);
  bottomScrollOffsetRef.current =
    listContentHeightRef.current - flatListHeightRef.current;

  const cardsCacheRef = useRef<{ [key: string]: DraggableGridCardRef }>({});
  const keysOfUndraggableItemsRef = useRef<string[]>([]);

  const responderReleaseTimeoutRef = useRef<NodeJS.Timeout>(undefined);
  const rearrangeAnimationsTimeoutRef = useRef<{
    key: string;
    timeout: NodeJS.Timeout;
  }>(undefined);

  const [shouldSetPanResponderRef, setShouldSetPanResponder] =
    useStateRef(false);
  const [itemDraggedRef, setItemDragged] = useStateRef<
    DraggableMasonryGridListItem<T> | undefined
  >(undefined);

  const lastWindowCheckMsRef = useRef(0);
  const lastOnEndReachedCheckKeyRef = useRef<string>(undefined);
  const lastScrollEventSentMsRef = useRef(0);
  const lastScrollEventOffsetRef = useRef(0);

  const animatedDraggedItemPositionRef = useRef(new Animated.ValueXY());
  const animatedDraggedItemScaleRef = useRef(new Animated.Value(1));
  const animatedDraggedItemTranslateYRef = useRef(new Animated.Value(0));
  const animatedScrollYRef = useRef(new Animated.Value(0));
  const animatedScrollOffsetRef = useRef(0);

  const [flatlistRenderKey, setFlatlistRenderKey] = useState(0);

  /*----------------------------- Helpers -----------------------------*/
  const keyExtractor = useCallback((item: DraggableMasonryGridListData<T>) => {
    if (item.type === 'empty_space') {
      return String(`${item.columnIndex}-${item.index}`);
    }
    return propsRef.current.keyExtractor(item);
  }, []);

  const lastItemInList =
    gridDataInSequenceRef.current[gridDataInSequenceRef.current.length - 1];
  const lastItemInListKeyRef = useRef('');
  lastItemInListKeyRef.current = lastItemInList
    ? keyExtractor(lastItemInList)
    : '';

  keysOfUndraggableItemsRef.current = useMemo(
    () =>
      gridDataInSequence
        .filter((item) => !item.isDraggable)
        .map((v) => keyExtractor(v)),
    [gridDataInSequence, keyExtractor]
  );

  const getItemOffsetOnFlatlist = useCallback(
    (item: DraggableMasonryGridListData<T>) =>
      item.offsetY + headerHeightRef.current,
    []
  );
  const getTotalScrollOffset = useCallback(
    () => listScrollOffsetRef.current + animatedScrollOffsetRef.current,
    []
  );

  const getOverlapingCard = useCallback(
    (vertices: Vertices, cardKeysToSkip: string[]) =>
      Object.values(cardsCacheRef.current).find(
        (cardCache) =>
          !cardKeysToSkip.includes(cardCache.key) &&
          cardCache.vertices &&
          // if centers of both cards are contained within each other
          checkIfContainsCoordinates(cardCache.vertices.center, vertices) &&
          checkIfContainsCoordinates(vertices.center, cardCache.vertices)
      ),
    []
  );
  const calculateAndCacheCardVertices = useCallback(
    async (skipDraggedItem = false) => {
      await Promise.all(
        Object.values(cardsCacheRef.current).map(async (cardCache) => {
          if (
            skipDraggedItem &&
            itemDraggedRef.current &&
            keyExtractor(itemDraggedRef.current) === cardCache.key
          )
            return;
          cardCache.vertices = await getViewVertices(
            cardCache.ref.current?.viewRef,
            {
              offsets: cardCache.offsets,
            }
          );
        })
      );
    },
    [keyExtractor]
  );

  const cardCacheInitialize = useCallback(
    (item: DraggableMasonryGridListItem<T>) => {
      const cardKey = keyExtractor(item);
      const position = new Animated.ValueXY();
      const cardRef = React.createRef<DraggableMasonryGridCardWrapperRef>();
      cardsCacheRef.current[cardKey] = {
        offsets: item.verticeoffsets,
        key: cardKey,
        position,
        ref: cardRef,
      };
    },
    [keyExtractor]
  );

  /*----------------------------- Scroll based events handlers -----------------------------*/
  const renderItemsInWindow = useCallback(
    (scrollOffset: number) => {
      // length of distance we are allowed to display above/below visible viewport
      const windowExtensionLength =
        (flatListHeightRef.current * (windowSize - 1)) / 2;
      const minOffsetY = Math.round(scrollOffset - windowExtensionLength);
      const maxOffsetY = Math.round(
        scrollOffset + flatListHeightRef.current + windowExtensionLength
      );

      const itemDraggedKey = itemDraggedRef.current
        ? keyExtractor(itemDraggedRef.current)
        : undefined;

      // render/un-render cards
      gridDataInSequenceRef.current.forEach((v) => {
        const key = keyExtractor(v);
        const cardTopPoint = getItemOffsetOnFlatlist(v);
        const cardBottomPoint = getItemOffsetOnFlatlist(v) + v.height;
        const shouldRender =
          (cardBottomPoint >= minOffsetY && cardTopPoint <= maxOffsetY) ||
          key === itemDraggedKey;
        cardsCacheRef.current[key]?.ref.current?.setShouldRender(shouldRender);
      });
    },
    [getItemOffsetOnFlatlist, keyExtractor]
  );

  const onScroll = useCallback(
    (scrollOffset: number) => {
      if (scrollOffset === lastScrollEventOffsetRef.current) return;
      lastScrollEventOffsetRef.current = scrollOffset;
      const nowMs = new Date().getTime();

      if (!!propsRef.current.onEndReached) {
        const distanceFromEnd = Math.round(
          bottomScrollOffsetRef.current - scrollOffset
        );
        const distanceFromEndRatio =
          distanceFromEnd / listContentHeightRef.current;

        if (
          distanceFromEnd < 10 ||
          distanceFromEndRatio <= onEndReachedThreshold
        ) {
          if (
            lastOnEndReachedCheckKeyRef.current !== lastItemInListKeyRef.current
          ) {
            lastOnEndReachedCheckKeyRef.current = lastItemInListKeyRef.current;
            propsRef.current.onEndReached({ distanceFromEnd });
          }
        }
      }

      const timeSinceLastCheckMs = nowMs - lastWindowCheckMsRef.current;
      if (timeSinceLastCheckMs > WINDOW_SIZE_CHECK_THROTTLE_MS) {
        lastWindowCheckMsRef.current = nowMs;
        renderItemsInWindow(scrollOffset);
      }

      if (!!propsRef.current.onScroll) {
        const timeSinceLastEventMs = nowMs - lastScrollEventSentMsRef.current;
        if (
          !propsRef.current.scrollEventThrottle ||
          timeSinceLastEventMs >= propsRef.current.scrollEventThrottle
        ) {
          lastScrollEventOffsetRef.current = nowMs;
          propsRef.current.onScroll(scrollOffset);
        }
      }
    },
    [
      onEndReachedThreshold,
      !!propsRef.current.onEndReached,
      !!propsRef.current.onScroll,
      renderItemsInWindow,
    ]
  );

  /*----------------------------- Auto scrolling handlers -----------------------------*/
  const autoScrollVaiablesRef = useRef<{
    scrollAnimation?: Animated.CompositeAnimation;
    scrollLoadMorePollInterval?: NodeJS.Timeout;
  }>({});
  const autoScrollMethods = useMemo(
    () => ({
      isScrolling: () => !!autoScrollVaiablesRef.current.scrollAnimation,
      startScroll: (direction: 'up' | 'down') => {
        const triggerScroll = () => {
          const desiredOffset =
            direction === 'up'
              ? topScrollOffsetRef.current
              : bottomScrollOffsetRef.current;
          const currentScrollOffset = getTotalScrollOffset();
          const distanceToDesiredOffset = desiredOffset - currentScrollOffset;
          // do not attempt to scroll if distanceToDesiredOffset is insignificant
          if (Math.abs(distanceToDesiredOffset) < 10) return;

          // adjust animation duration based on distance to offset, to keep scroll animation speed consistent
          const animationDurationMS = Math.abs(
            distanceToDesiredOffset / AUTO_SCROLL_VELOCITY
          );

          autoScrollVaiablesRef.current.scrollAnimation = Animated.parallel([
            Animated.timing(animatedScrollYRef.current, {
              useNativeDriver: true,
              duration: animationDurationMS,
              // animate to top/bottom of the list, but take current non animated list offset into account
              toValue: listScrollOffsetRef.current - desiredOffset,
            }),
            Animated.timing(animatedDraggedItemTranslateYRef.current, {
              useNativeDriver: true,
              duration: animationDurationMS,
              // keep dragged item where it is on screen by applying opposite animation effect
              toValue: desiredOffset - listScrollOffsetRef.current,
            }),
          ]);
          autoScrollVaiablesRef.current.scrollAnimation.start(() => {
            autoScrollVaiablesRef.current.scrollAnimation = undefined;
          });
        };

        // trigger immidiatly
        triggerScroll();

        // if onEndReached is provided, keep polling in case new clips have been loaded underneath
        if (!!propsRef.current.onEndReached) {
          // clear previous interval in case called multiple times
          if (autoScrollVaiablesRef.current.scrollLoadMorePollInterval)
            clearInterval(
              autoScrollVaiablesRef.current.scrollLoadMorePollInterval
            );

          autoScrollVaiablesRef.current.scrollLoadMorePollInterval =
            setInterval(() => {
              if (autoScrollVaiablesRef.current.scrollAnimation) return;
              // if scroll animation does not exist, it means previous scroll has finished
              // and attempt to start next scroll in case new clips have been loaded below
              triggerScroll();
            }, AUTO_SCROLL_MAYBE_LOADED_MORE_CLIPS_CHECK_POLL_MS);
        }
      },
      stopScroll: () => {
        clearInterval(autoScrollVaiablesRef.current.scrollLoadMorePollInterval);
        autoScrollVaiablesRef.current.scrollAnimation?.stop();
        autoScrollVaiablesRef.current.scrollAnimation = undefined;
      },
    }),
    [getTotalScrollOffset, !!propsRef.current.onEndReached]
  );

  /*----------------------------- Auto scroll listner -----------------------------*/
  useEffect(() => {
    const listner = animatedScrollYRef.current.addListener((v) => {
      animatedScrollOffsetRef.current = -v.value;
      onScroll(getTotalScrollOffset());
    });
    return () => animatedScrollYRef.current.removeListener(listner);
  }, [getTotalScrollOffset, onScroll]);

  /*----------------------------- Drag/drop Rearrange handlers -----------------------------*/
  const getDataInRearrangedSequence = useCallback(
    (
      draggedCardKey: string,
      overlappingCardKey: string,
      dataInCurrentSequence: {
        columnsForGrid: DraggableMasonryGridListData<T>[][];
        columnHeights: number[];
        gridDataInSequence: DraggableMasonryGridListData<T>[];
        rawDataInSequence: DraggableItem<T>[];
      }
    ) => {
      const { gridDataInSequence, rawDataInSequence } = dataInCurrentSequence;

      const itemDragged = gridDataInSequence.find(
        (itemOriginal) => keyExtractor(itemOriginal) === draggedCardKey
      );
      const itemOverlapping = gridDataInSequence.find(
        (itemOriginal) => keyExtractor(itemOriginal) === overlappingCardKey
      );
      if (!itemDragged || !itemOverlapping) return dataInCurrentSequence;
      const { originalIndex: indexToMoveFrom } = itemDragged;
      const { originalIndex: indexToMoveTo } = itemOverlapping;

      const rearrangedRawData = arrayMoveFromIndexToIndex(
        rawDataInSequence,
        indexToMoveFrom,
        indexToMoveTo
      );
      const rearrangedGridData = getGridColumns(
        rearrangedRawData,
        numberOfColumns,
        propsRef.current.columnWidth
      );

      return {
        ...rearrangedGridData,
        rawDataInSequence: rearrangedRawData,
      };
    },
    [keyExtractor, numberOfColumns]
  );
  const getRearrangeAnimation = useCallback(
    (
      position: Animated.ValueXY | Animated.Value,
      value: Animated.TimingAnimationConfig['toValue']
    ) =>
      Animated.timing(position, {
        toValue: value,
        duration: REARRANGE_ANIMATION_DURATION_MS,
        useNativeDriver: true,
      }),
    []
  );

  const runRearrangeAnimations = useCallback(
    async (
      rearrangedGridDataInSequence: DraggableMasonryGridListData<T>[],
      skipDraggedItem = false,
      prallelAnimations?: Animated.CompositeAnimation[]
    ) => {
      const animations: Animated.CompositeAnimation[] = prallelAnimations ?? [];
      gridDataInSequenceRef.current.forEach((item) => {
        // do not rearrange empty spaces
        if (item.type === 'empty_space') return;
        const key = keyExtractor(item);

        const oldPosition = item.position;
        const newPosition = rearrangedGridDataInSequence.find(
          (newItem) => keyExtractor(newItem) === key
        )?.position;

        if (
          !cardsCacheRef.current[key] ||
          !newPosition ||
          (skipDraggedItem &&
            keyExtractor(item) === keyExtractor(itemDraggedRef.current!))
        )
          return;

        animations.push(
          getRearrangeAnimation(cardsCacheRef.current[key].position, {
            x: newPosition.x - oldPosition.x,
            y: newPosition.y - oldPosition.y,
          })
        );
      });
      if (!skipDraggedItem) {
        animations.push(
          getRearrangeAnimation(animatedDraggedItemPositionRef.current, {
            x: 0,
            y: 0,
          })
        );
      }
      return new Promise<void>((res) =>
        Animated.parallel(animations).start(() => res())
      );
    },
    [keyExtractor, getRearrangeAnimation]
  );
  const resetRearrangeAnimations = useCallback(() => {
    Object.values(cardsCacheRef.current).forEach((cardCache) =>
      cardCache.position.setValue({ x: 0, y: 0 })
    );
  }, []);

  const handleItemDragStart = useCallback(
    (item: DraggableMasonryGridListItem<T>) => {
      setShouldSetPanResponder(true);
      setItemDragged(item);
      calculateAndCacheCardVertices();
      Animated.spring(animatedDraggedItemScaleRef.current, {
        toValue: DRAGGED_ITEM_SCALE,
        useNativeDriver: true,
      }).start();
    },
    [calculateAndCacheCardVertices]
  );
  const triggerDragEnd = useCallback(() => {
    if (!itemDraggedRef.current) return;
    setShouldSetPanResponder(false);
    autoScrollMethods.stopScroll();

    // reset scroll animations and set actual scroll value
    const currentScrollOffset = getTotalScrollOffset();
    // Given both animated scroll value and list scroll values are changing simultaneously
    // We update the variables simultaneously instead of waiting for event to fire for each
    // which may result in unessary triggering of onScroll methods
    animatedScrollOffsetRef.current = 0;
    listScrollOffsetRef.current = currentScrollOffset;
    // update the scrolls to move all scroll to flatlist native scroll
    animatedScrollYRef.current.setValue(animatedScrollOffsetRef.current);
    listRef.current?.scrollToOffset({
      animated: false,
      offset: listScrollOffsetRef.current,
    });

    // remove current animated effects from dragged item
    const animationUndoScrollOffset = getRearrangeAnimation(
      animatedDraggedItemTranslateYRef.current,
      0
    );
    const animationUndoScale = Animated.spring(
      animatedDraggedItemScaleRef.current,
      {
        toValue: 1,
        useNativeDriver: true,
      }
    );
    // animate dragged item to it's new position
    runRearrangeAnimations(
      rearrangeCacheRef.current.gridDataInSequence,
      false,
      [animationUndoScrollOffset, animationUndoScale]
    ).finally(() => {
      // reset data
      setItemDragged(undefined);
      // set it false again just in case user tried to drag another item meanwhile
      setShouldSetPanResponder(false);
      setRearrangedRawData(rearrangeCacheRef.current.rawDataInSequence);

      // force re render root flatlist
      setFlatlistRenderKey((v) => v + 1);
      // to reduce the flicker when scrolling to the current offset of newly render flatlist we do:
      const currentScrollOffset = getTotalScrollOffset();
      // move all scroll offset to animated value so when list is rendered it's already at correct offset
      animatedScrollOffsetRef.current = currentScrollOffset;
      listScrollOffsetRef.current = 0;
      animatedScrollYRef.current.setValue(-animatedScrollOffsetRef.current);
      listRef.current?.scrollToOffset({
        animated: false,
        offset: listScrollOffsetRef.current,
      });
      // once list is rendered move all scroll offset back to list's scrollview
      setTimeout(() => {
        animatedScrollOffsetRef.current = 0;
        listScrollOffsetRef.current = currentScrollOffset;
        animatedScrollYRef.current.setValue(animatedScrollOffsetRef.current);
        listRef.current?.scrollToOffset({
          animated: false,
          offset: listScrollOffsetRef.current,
        });
      }, 0);

      // make sure the values are reset in case animation was interrupted
      animatedDraggedItemTranslateYRef.current.setValue(0);
      animatedDraggedItemScaleRef.current.setValue(1);

      propsRef.current.onRearrange(rearrangeCacheRef.current.rawDataInSequence);
    });
  }, [
    autoScrollMethods,
    getTotalScrollOffset,
    getRearrangeAnimation,
    runRearrangeAnimations,
  ]);
  const handleItemDragEnd = useCallback(
    (skipTimeout = false) => {
      if (!itemDraggedRef.current) return;
      clearTimeout(responderReleaseTimeoutRef.current);

      if (typeof skipTimeout === 'boolean' && skipTimeout) {
        triggerDragEnd();
      } else {
        responderReleaseTimeoutRef.current = setTimeout(
          triggerDragEnd,
          WAIT_FOR_RESPONDER_TRANSFER_MS
        );
      }
    },
    [triggerDragEnd]
  );

  const matchAnimationPositionsToCurrentDataSequence = useCallback(async () => {
    const gridData = getGridColumns(
      propsRef.current.data,
      numberOfColumns,
      propsRef.current.columnWidth
    );
    rearrangeCacheRef.current = {
      ...gridData,
      rawDataInSequence: propsRef.current.data,
    };
    await runRearrangeAnimations(gridData.gridDataInSequence);
  }, [numberOfColumns, runRearrangeAnimations]);

  const draggedItemPanhandlers = useMemo(
    () =>
      PanResponder.create({
        onStartShouldSetPanResponder: () => !!shouldSetPanResponderRef.current,
        onMoveShouldSetPanResponder: () => !!shouldSetPanResponderRef.current,
        onStartShouldSetPanResponderCapture: () =>
          !!shouldSetPanResponderRef.current,
        onMoveShouldSetPanResponderCapture: () =>
          !!shouldSetPanResponderRef.current,
        // Do not consider responder as released if it's being transfered to this responder from child responder
        // that triggered the drag
        onPanResponderGrant: (e) => {
          onTouchResponderGrantPageYRef.current = e.nativeEvent.pageY;
          onTouchResponderGrantScrollYRef.current = getTotalScrollOffset();
          // clear timeout that primed to release the dragged item when touch event was remove from responder else where
          // because the touch has been move to this pan responder now
          setTimeout(() => clearTimeout(responderReleaseTimeoutRef.current), 0);
        },
        onPanResponderMove: Animated.event(
          [
            null,
            {
              dx: animatedDraggedItemPositionRef.current.x,
              dy: animatedDraggedItemPositionRef.current.y,
            },
          ],
          {
            listener: (e: NativeSyntheticEvent<NativeTouchEvent>) => {
              if (!itemDraggedRef.current) return;
              const itemDraggedKey = keyExtractor(itemDraggedRef.current);
              const itemDraggedoffsets = itemDraggedRef.current.verticeoffsets;
              const itemDraggedCardRef =
                cardsCacheRef.current[itemDraggedKey]?.ref;

              const offsetPadding = Math.min(
                50,
                Math.round(itemDraggedRef.current.height / 2)
              );
              // pageY is current offset of the touch, substract pageY recorded on touch begin == relative change in offset
              const touchMovedOffsetY =
                e.nativeEvent.pageY - onTouchResponderGrantPageYRef.current;
              // substracting the scroll offset (recorded o}, [getTotalScrollOffset, onScroll])n touch begin), from item offset on the flatlist
              // == distance of item on the screen relative to flatlist view
              const touchBeginItemLocationY =
                getItemOffsetOnFlatlist(itemDraggedRef.current) -
                onTouchResponderGrantScrollYRef.current;
              // Adding the distance y touch has moved to the initial location y of item on screen
              // == current location y of item on the screen
              const itemCurrentOffsetY = Math.round(
                touchMovedOffsetY + touchBeginItemLocationY
              );
              const isItemOffScreenTop =
                itemCurrentOffsetY <
                -offsetPadding + (propsRef.current.viewPostOffsets?.top ?? 0);
              const isItemOffScreenBottom =
                itemCurrentOffsetY + itemDraggedRef.current.height >
                flatListHeightRef.current +
                  offsetPadding -
                  (propsRef.current.viewPostOffsets?.bottom ?? 0);
              if (isItemOffScreenTop || isItemOffScreenBottom) {
                const desiredOffset = isItemOffScreenTop
                  ? topScrollOffsetRef.current
                  : bottomScrollOffsetRef.current;
                const distanceToDesiredOffset =
                  desiredOffset - getTotalScrollOffset();

                if (Math.abs(distanceToDesiredOffset) > 10) {
                  if (!autoScrollMethods.isScrolling()) {
                    autoScrollMethods.startScroll(
                      isItemOffScreenTop ? 'up' : 'down'
                    );
                  }
                  // if auto scrolling skip rearrange to avoid additional processing time
                  return;
                }
              } else {
                autoScrollMethods.stopScroll();
              }
              (async () => {
                const vertices = await getViewVertices(
                  itemDraggedCardRef?.current?.viewRef,
                  {
                    offsets: itemDraggedoffsets,
                    scale: DRAGGED_ITEM_SCALE,
                  }
                );
                const draggedCardKey = keyExtractor(itemDraggedRef.current!);
                const overlappingCardKey = getOverlapingCard(
                  vertices,
                  // skip overlap check with self and undraggable items
                  [itemDraggedKey, ...keysOfUndraggableItemsRef.current]
                )?.key;

                if (!overlappingCardKey) return;
                // do not clear timeout unless overlappingCardKey has changed
                if (
                  overlappingCardKey ===
                  rearrangeAnimationsTimeoutRef.current?.key
                )
                  return;

                clearTimeout(rearrangeAnimationsTimeoutRef.current?.timeout);

                const animationTimeout = setTimeout(async () => {
                  rearrangeCacheRef.current = getDataInRearrangedSequence(
                    draggedCardKey,
                    overlappingCardKey,
                    rearrangeCacheRef.current
                  );
                  await runRearrangeAnimations(
                    rearrangeCacheRef.current.gridDataInSequence,
                    true
                  );
                  // caluclate and store vertices of rearranged card positions
                  await calculateAndCacheCardVertices();

                  rearrangeAnimationsTimeoutRef.current = undefined;
                }, REARRANGE_CHECK_THROTTLE_MS);

                rearrangeAnimationsTimeoutRef.current = {
                  key: overlappingCardKey,
                  timeout: animationTimeout,
                };
              })();
            },
            useNativeDriver: false,
          }
        ),
        onPanResponderRelease: () => handleItemDragEnd(true),
      }),
    [
      autoScrollMethods,
      calculateAndCacheCardVertices,
      getItemOffsetOnFlatlist,
      getTotalScrollOffset,
      handleItemDragEnd,
      keyExtractor,
      runRearrangeAnimations,
    ]
  ).panHandlers;

  /*----------------------------- Handler for grid -----------------------------*/
  useImperativeHandle(
    ref,
    () => ({
      animateToOriginalPositions: matchAnimationPositionsToCurrentDataSequence,
      scrollToTop: (animated = false) => {
        listRef.current?.scrollToOffset({
          offset: 0,
          animated,
        });
      },
      scrollToIndex: ({ animated = false, index, offset }) => {
        const itemToScrollTo = gridDataInSequenceRef.current.find(
          (item) => item.originalIndex === index
        );
        if (!itemToScrollTo) return;

        setTimeout(() => {
          listRef.current?.scrollToOffset({
            offset: getItemOffsetOnFlatlist(itemToScrollTo) + offset,
            animated,
          });
        }, 0);
      },
    }),
    [getItemOffsetOnFlatlist, matchAnimationPositionsToCurrentDataSequence]
  );

  /*----------------------------- Clear all timeouts etc on unmount -----------------------------*/
  useEffect(() => {
    return () => {
      clearTimeout(responderReleaseTimeoutRef.current);
      clearTimeout(rearrangeAnimationsTimeoutRef.current?.timeout);
      clearInterval(autoScrollVaiablesRef.current.scrollLoadMorePollInterval);
    };
  }, []);

  /*----------------------------- Data change handler -----------------------------*/
  useLayoutEffect(() => {
    // when grid data changes
    // - render new items in view
    renderItemsInWindow(getTotalScrollOffset());
    // - calculate vertices of new items
    calculateAndCacheCardVertices();
    // - reset animations as grid will do the work to show data in new sequence
    resetRearrangeAnimations();
    rearrangeCacheRef.current = {
      columnsForGrid,
      columnHeights,
      gridDataInSequence,
      rawDataInSequence: rearrangedRawData,
    };
  }, [columnsForGrid]);

  /*************** Main render ***************/
  const renderItem = useCallback(
    ({ item }: { item: DraggableMasonryGridListData<T> }) => {
      if (item.type === 'empty_space') {
        return (
          <View
            style={{
              height: item.height,
              opacity: 0,
              width: propsRef.current.columnWidth,
            }}
          />
        );
      }
      const key = keyExtractor(item);
      if (!cardsCacheRef.current[key]) {
        cardCacheInitialize(item);
      }
      if (!cardsCacheRef.current[key]) {
        throw new Error(
          '[renderItem] cardsCacheRef.current[key] cannot be undefined'
        );
      }
      const { position, ref } = cardsCacheRef.current[key];
      const isThisCardBeingDragged =
        itemDraggedRef.current && key === keyExtractor(itemDraggedRef.current);
      return (
        <DraggableMasonryGridCardWrapper
          // mimic react native flatlist behaviour
          alwaysRender={item.index < initialNumToRender}
          panHandlers={draggedItemPanhandlers}
          ref={ref}
          style={{
            height: item.height,
            transform: [
              ...position.getTranslateTransform(),
              ...(isThisCardBeingDragged
                ? [
                    ...animatedDraggedItemPositionRef.current.getTranslateTransform(),
                    { translateY: animatedDraggedItemTranslateYRef.current },
                    { scale: animatedDraggedItemScaleRef.current },
                  ]
                : []),
            ],
            width: propsRef.current.columnWidth,
          }}
          wobble={!isThisCardBeingDragged && !!propsRef.current.wobble}
        >
          {propsRef.current.renderItem(
            item,
            () => handleItemDragStart(item),
            handleItemDragEnd
          )}
        </DraggableMasonryGridCardWrapper>
      );
    },
    [
      cardCacheInitialize,
      draggedItemPanhandlers,
      handleItemDragEnd,
      handleItemDragStart,
      keyExtractor,
    ]
  );
  const renderCellComponent = useCallback<
    ComponentType<CellRendererProps<DraggableMasonryGridListData<T>>>
  >(
    ({ style, ...cellComponentProps }) => {
      const item: DraggableMasonryGridListData<T> = cellComponentProps.item;
      const isDragged =
        itemDraggedRef.current &&
        keyExtractor(itemDraggedRef.current) === keyExtractor(item);
      return (
        <View
          style={[style, { zIndex: isDragged ? 1 : 0 }]}
          {...cellComponentProps}
        />
      );
    },
    [keyExtractor]
  );
  const getItemLayout = useCallback(
    (
      data: ArrayLike<DraggableMasonryGridListData<T>> | null | undefined,
      index: number
    ) => {
      const content = data?.[index];
      return {
        index,
        length: content?.height ?? 0,
        offset: content?.offsetY ?? 0,
      };
    },
    [getItemOffsetOnFlatlist]
  );
  const renderColumn: ListRenderItem<DraggableMasonryGridListData<T>[]> =
    useCallback(
      ({ item: columnItem, index }) => (
        <Animated.FlatList
          // to make zIndex work in FlatList
          CellRendererComponent={renderCellComponent}
          // @ts-ignore
          data={columnItem}
          getItemLayout={getItemLayout}
          initialNumToRender={Number.MAX_SAFE_INTEGER}
          keyExtractor={keyExtractor}
          listKey={String(index)}
          renderItem={renderItem}
          scrollEnabled={false}
          showsVerticalScrollIndicator={false}
          style={{
            transform: [{ translateY: animatedScrollYRef.current }],
            zIndex: itemDraggedRef.current?.columnIndex === index ? 1 : 0,
          }}
          viewabilityConfigCallbackPairs={
            propsRef.current.columnViewabilityConfigCallbackPairs?.[index]
          }
          windowSize={Number.MAX_SAFE_INTEGER}
        />
      ),
      [getItemLayout, keyExtractor, renderCellComponent, renderItem]
    );

  return (
    <FlatList
      {...props}
      key={flatlistRenderKey}
      data={columnsForGrid.find((col) => col.length > 0) ? columnsForGrid : []}
      disableScrollViewPanResponder={shouldSetPanResponderRef.current}
      initialNumToRender={numberOfColumns}
      keyExtractor={(_, index) => String(index)}
      ListHeaderComponent={
        props.ListHeaderComponent ? (
          <Animated.View
            onLayout={(e) =>
              (headerHeightRef.current = Math.round(
                e.nativeEvent.layout.height
              ))
            }
            style={{ transform: [{ translateY: animatedScrollYRef.current }] }}
          >
            {/* @ts-ignore-next-line */}
            {props.ListHeaderComponent}
          </Animated.View>
        ) : null
      }
      ListFooterComponent={
        props.ListFooterComponent ? (
          <Animated.View
            style={{ transform: [{ translateY: animatedScrollYRef.current }] }}
          >
            {/* @ts-ignore-next-line */}
            {props.ListFooterComponent}
          </Animated.View>
        ) : null
      }
      numColumns={numberOfColumns}
      onLayout={(e) => {
        flatListHeightRef.current = Math.round(e.nativeEvent.layout.height);
        props.onLayout?.(e);
      }}
      onScroll={(e) => {
        listScrollOffsetRef.current = e.nativeEvent.contentOffset.y;
        onScroll(getTotalScrollOffset());
      }}
      ref={listRef}
      renderItem={renderColumn}
      scrollEventThrottle={1}
      scrollEnabled={!shouldSetPanResponderRef.current && props.scrollEnabled}
    />
  );
}

// to allow generic props with forwardRef
export const DraggableMasonryGridList = forwardRef(GridList) as <T>(
  props: DraggableMasonryGridListProps<T> & {
    ref?: ForwardedRef<DraggableMasonryGridListRef>;
  }
) => ReturnType<typeof GridList>;
