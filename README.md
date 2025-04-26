# react-native-draggable-masonry-grid

React native Flatlist based implementation of masonary grid with drag/drop functionality.
Accepts pretty much all props as Flatlist but with some subtle differences.
Ability to create sectioned list with some hacks.

Cons:

- Data returned by different callbacks can be confusing, but I have given examples in the Usage section, so hopefully that will be enough
- it requires you to pass height of each element to be displayed as part of data.
- viewabilityConfigCallbackPairs need to be passed separately for each column as columnViewabilityConfigCallbackPairs.

## Installation

```sh
npm install react-native-draggable-masonry-grid
```

## Usage

```tsx
import DraggableMasonryGridList, {
  DraggableItem,
  DraggableMasonryGridListItem,
  DraggableMasonryGridListRef,
} from 'react-native-draggable-masonry-grid';

// ...

const gridData = useMemo(() => {
  return yourDataArray.map(item => {
    return {
      // height is required to be known before render
      height: item.height,
      isDraggable: true,
      item: item,
      type: 'ITEM',
    }
  })
}, [yourDataArray])

// Alternatively you can also display sectioned masonary grid as well, but it doesn't work well with drag and drop
const gridData = useMemo(() => {
  return yourSectionsArray.map((items, index) => {
    return [
      {
        height: sectionTitleHeight,
        isDraggable: false,
        item: {
          // whatever data is required for you to know that this is a title in your renderItem function
        },
        type: 'ITEM',
      }
      ...(items.map((item) => {
        return {
          // height is required to be known before render
          height: item.height,
          isDraggable: true,
          item: item,
          type: 'ITEM',
        }
      })),
      // add 1 HEIGHT_EQUILIZER's for each column (2 columns in this example)
      // This tells the component to add empty views to fill out space in that column up to the height of largest column
      { type: 'HEIGHT_EQUILIZER' },
      { type: 'HEIGHT_EQUILIZER' },
    ]

  })
}, [yourSectionsArray])

// ...

const gridListRef = useRef<DraggableMasonryGridListRef>(null)

const onRearrange = useCallback((rearrangedData: DraggableItem<YourItemType>) => {
    // You will need to filter out any HEIGHT_EQUILIZER's etc as need be to get the data in new sequence
    const rearrangedPosts = rearrangedData
        .map(item => (item.type === 'ITEM' ? item.item : null))
        .filter((item): item is YourItemType => !!item)
    try {
      // ... Do stuff
    } catach {
      gridListRef.current?.animateToOriginalPositions()
    }
}, [])


const onScrollToItem = (itemId: string, animated: boolean = false) => {
    const indexToScrollTo = gridData.current.findIndex(
        item => item.type === 'ITEM' && item.item.pathToItemId === itemId,
    )
    if (indexToScrollTo < 0) return

    setTimeout(
        () =>
            gridListRef.current?.scrollToIndex({
                index: indexToScrollTo,
                offset: STORY_PINNED_HEADER_HEIGHT - subheaderHeightRef.current,
                animated,
            }),
        0,
    )
}

// ...

const renderItem = useCallback(
  (
    itemData: DraggableMasonryGridListItem<YourItemType>,
    drag: () => void,
    dragRelease: () => void
  ) => {
    const { item, columnIndex } = itemData;
    return (
      <View
        // ...
        onPressOut={dragRelease}
      >
        {/** ... */}
      </View>
    );
  },
  [
    // ...
  ]
);

// ...

return (
  <DraggableMasonryGridList<YourItemType>
    contentContainerStyle={styles.contentContainer}
    columnViewabilityConfigCallbackPairs={[
      viewabilityConfigCallbackPairsCol1,
      viewabilityConfigCallbackPairsCol2,
    ]}
    numColumns={2}
    columnWidth={(windowWidth - sideMargins) / 2 - paddingBetweenCards}
    data={gridData}
    // indicatorStyle={colors.ScrollIndicator}
    keyExtractor={keyExtractor}
    ListHeaderComponent={
      // ...
    }
    ListEmptyComponent={
      // ...
    }
    onEndReached={onLoadMorePosts}
    onEndReachedThreshold={0.3}
    onRearrange={onRearrange(rearrangedData) => {}}
    onScroll={onScroll}
    ref={gridListRef}
    refreshControl={
      <RefreshControl refreshing={isRefreshing} onRefresh={onRefresh} />
    }
    renderItem={renderItem}
    scrollEventThrottle={250}
    style={
      // ...
    }
    viewOffsets={{
      top: heightOfStickyHeader,
      bottom: heightOfStickyBottom,
    }}
    windowSize={2}
    wobble={isRearranging}
  />
);
```

## Contributing

See the [contributing guide](CONTRIBUTING.md) to learn how to contribute to the repository and the development workflow.

## License

MIT

---

Made with [create-react-native-library](https://github.com/callstack/react-native-builder-bob)
