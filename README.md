# react-native-draggable-masonry-grid

React native Flatlist based implementation of masonary grid with drag/drop functionality.
Accepts pretty much all props as Flatlist but with some subtle differences.
Ability to create sectioned list with some hacks.

Cons:

- it requires you to pass height of each element to be displayed as part of data.
- Sticky headers/indices may not work as expected.
- viewabilityConfigCallbackPairs need to be passed separately for each column as columnViewabilityConfigCallbackPairs.
- Data returned by different callbacks can be confusing, but I have given examples in the Usage section, so hopefully that will be enough.

## Demo

<div style="display: flex; flex-direction: row; justify-content: center;">
  <div>
    <p>Default</p>
    <img width="400" src="https://github.com/dcheema6/react-native-draggable-masonry-grid/blob/main/example.gif?raw=true">
  </div>
  <div>
    <p>With wobble prop</p>
    <img width="400" src="https://github.com/dcheema6/react-native-draggable-masonry-grid/blob/main/example_wobble.gif?raw=true">
  </div>
</div>

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

// Wrapping your data to pass into grid component
const gridData: DraggableItem<YourItemType>[] = useMemo(() => {
  return yourDataArray.map((item: YourItemType) => {
    return {
      // height is required to be known before render
      height: item.height,
      isDraggable: true,
      item: item,
      type: 'ITEM',
    }
  })
}, [yourDataArray])

// Alternatively you can also display sectioned masonary grid
// as well, but it doesn't work well with drag and drop
const gridData: DraggableItem<YourItemType>[] = useMemo(() => {
  return yourSectionsArray.map((items: YourItemType[]) => {
    return [
      {
        height: sectionTitleHeight,
        isDraggable: false,
        item: {
          // whatever data is required for you to know that
          // this is a title in your renderItem function
        },
        type: 'ITEM',
      }
      ...(items.map((item: YourItemType) => {
        return {
          // height is required to be known before render
          height: item.height,
          isDraggable: true,
          item: item,
          type: 'ITEM',
        }
      })),
      // add 1 HEIGHT_EQUILIZER's for each column
      // (2 columns in this example). This tells the
      // component to add empty views to fillout space
      // in that column up to the height of largest column
      { type: 'HEIGHT_EQUILIZER' },
      { type: 'HEIGHT_EQUILIZER' },
    ]

  })
}, [yourSectionsArray])

// ...

const gridListRef = useRef<DraggableMasonryGridListRef>(null)

// Handling async rearrange operations
const onRearrangeAsync = useCallback(
  async (rearrangedData: DraggableItem<YourItemType>) => {
    // You will need to filter out any HEIGHT_EQUILIZER's
    // etc as need be to get the data in new sequence
    const rearrangedArray = rearrangedData
        .map(item => (item.type === 'ITEM' ? item.item : null))
        .filter((item): item is YourItemType => !!item)
    try {
      // ... Do async stuff
      setYourDataArray(rearrangedArray)
    } catach {
      // revert back on failure
      gridListRef.current?.animateToOriginalPositions()
    }
  }
, [])

// Handling sync rearrange operations
const onRearrangeSync = useCallback(
  async (rearrangedData: DraggableItem<YourItemType>) => {
    // You will need to filter out any HEIGHT_EQUILIZER's
    // etc as need be to get the data in new sequence
    const rearrangedArray = rearrangedData
        .map(item => (item.type === 'ITEM' ? item.item : null))
        .filter((item): item is YourItemType => !!item)
    setYourDataArray(rearrangedArray)
  }
, [])

// Example on how to scroll any item
const scrollToItemById = (itemId: string, animated: boolean = false) => {
    const indexToScrollTo = gridData.current.findIndex(
        item => item.type === 'ITEM' && item.item.pathToItemId === itemId,
    )
    if (indexToScrollTo < 0) return

    setTimeout(
        () =>
            gridListRef.current?.scrollToIndex({
                index: indexToScrollTo,
                offset: heightOfStickyHeader + yourRequiredOffset,
                animated,
            }),
        0,
    )
}

// ...

const renderItem = useCallback(
  (
    // DraggableMasonryGridListItem provides extra props such as
    // column index for you to use in this function
    itemData: DraggableMasonryGridListItem<YourItemType>,
    drag: () => void,
    dragRelease: () => void
  ) => {
    const { item, columnIndex } = itemData;
    return (
      <Pressable
        // ...
        onLongPress={drag}
        onPressOut={dragRelease}
        // ...
      >
        {/** ... */}
      </Pressable>
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
