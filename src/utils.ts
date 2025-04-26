import { useRef, useState, type RefObject } from 'react';
import { type MeasureOnSuccessCallback, View } from 'react-native';
import type {
  Coordinates,
  DraggableItem,
  DraggableMasonryGridListData,
  Vertices,
} from './types';

/**
 *
 * @param array
 * @param index
 * @returns new array with item at added at given index
 */
export function arrayAddItemAtIndex<T>(array: T[], index: number, item: T) {
  return [...array.slice(0, index), item, ...array.slice(index)];
}

/**
 *
 * @param array
 * @param index
 * @returns new array with item removed at given index
 */
export function arrayRemoveItemAtIndex<T>(array: T[], index: number) {
  return [...array.slice(0, index), ...array.slice(index + 1)];
}

/**
 *
 * @param array
 * @param indexFrom
 * @param indexTo
 * @returns new array with item that was in indexFrom moved to indexTo
 */
export function arrayMoveFromIndexToIndex<T>(
  array: DraggableItem<T>[],
  indexFrom: number,
  indexTo: number
): DraggableItem<T>[] {
  if (indexFrom < indexTo && array[indexFrom]) {
    return [
      ...array.slice(0, indexFrom),
      ...array.slice(indexFrom + 1, indexTo + 1),
      array[indexFrom],
      ...array.slice(indexTo + 1),
    ];
  } else if (indexFrom > indexTo && array[indexFrom]) {
    return [
      ...array.slice(0, indexTo),
      array[indexFrom],
      ...array.slice(indexTo, indexFrom),
      ...array.slice(indexFrom + 1),
    ];
  } else {
    return [...array];
  }
}

export function getGridColumns<T>(
  data: DraggableItem<T>[],
  numberOfColumns: number,
  columnWidth: number
) {
  const columnHeightsTracker: number[] = new Array(numberOfColumns);
  const gridDataInSequence: DraggableMasonryGridListData<T>[] = new Array(
    data.length
  );
  const columnsForGrid: DraggableMasonryGridListData<T>[][] = new Array(
    numberOfColumns
  );

  for (let i = 0; i < numberOfColumns; i++) {
    columnHeightsTracker[i] = 0;
    columnsForGrid[i] = [];
  }

  if (!data.length) {
    return {
      columnsForGrid,
      gridDataInSequence,
      columnHeights: columnHeightsTracker,
    };
  }

  data.forEach((item, index) => {
    if (item.type === 'HEIGHT_EQUILIZER') {
      // adds empty space to compensate for unaligned extra height of last columns item
      const maxColumnHeight = Math.max(...columnHeightsTracker);

      for (let i = 0; i < columnHeightsTracker.length; i++) {
        const currentColumnHeight = columnHeightsTracker[i];
        const height = maxColumnHeight - (currentColumnHeight ?? 0);

        const data: DraggableMasonryGridListData<T> = {
          columnIndex: i,
          height,
          isDraggable: false,
          index: columnsForGrid[i]?.length ?? 0,
          offsetY: columnHeightsTracker[i] ?? 0,
          originalIndex: index,
          position: { x: i * columnWidth, y: columnHeightsTracker[i] ?? 0 },
          type: 'empty_space',
        };
        columnsForGrid[i]?.push(data);
        gridDataInSequence[index] = data;
        columnHeightsTracker[i] = (columnHeightsTracker[i] ?? 0) + height;
      }
    } else {
      const minColumnHeight = Math.min(...columnHeightsTracker);
      // add to earliest column if height with 10px of minColumnHeight
      const columnIndexToAddTo = columnHeightsTracker.findIndex(
        (height) => height < minColumnHeight + 10
      );

      const data: DraggableMasonryGridListData<T> = {
        columnIndex: columnIndexToAddTo,
        height: Math.round(item.height),
        isDraggable: item.isDraggable,
        index: columnsForGrid[columnIndexToAddTo]?.length ?? 0,
        item: item.item,
        offsetY: columnHeightsTracker[columnIndexToAddTo] ?? 0,
        verticeoffsets: item.verticeoffsets,
        originalIndex: index,
        position: {
          x: columnIndexToAddTo * columnWidth,
          y: columnHeightsTracker[columnIndexToAddTo] ?? 0,
        },
        type: 'item',
      };
      columnsForGrid[columnIndexToAddTo]?.push(data);
      gridDataInSequence[index] = data;
      columnHeightsTracker[columnIndexToAddTo] =
        (columnHeightsTracker[columnIndexToAddTo] ?? 0) + data.height;
    }
  });

  return {
    columnsForGrid,
    gridDataInSequence,
    columnHeights: columnHeightsTracker,
  };
}

export function getRawDataFromGridColumns<T>(
  columnsForGrid: DraggableMasonryGridListData<T>[][],
  columnHeights: number[]
) {
  const totalItems = columnsForGrid.reduce(
    (length, column) => (length += column.length),
    0
  );
  const rawDataInSequence: DraggableItem<T>[] = new Array(totalItems);
  const columnHeightsTracker: number[] = new Array(...columnHeights);
  const columnIndexTrackers: number[] = columnsForGrid.map(
    (column) => column.length - 1
  );

  let lastItem: DraggableMasonryGridListData<T> | undefined = undefined;
  for (let i = totalItems - 1; i >= 0; i--) {
    const maxColumnHeight = Math.max(...columnHeightsTracker);
    const columnIndexToExtractFrom = columnHeightsTracker.findIndex(
      (height) => height === maxColumnHeight
    );
    // extract last item in the column
    const item =
      columnsForGrid[columnIndexToExtractFrom]?.[
        columnIndexTrackers[columnIndexToExtractFrom] ?? 0
      ];

    columnHeightsTracker[columnIndexToExtractFrom] =
      (columnHeightsTracker[columnIndexToExtractFrom] ?? 0) -
      (item?.height ?? 0);
    columnIndexTrackers[columnIndexToExtractFrom] =
      (columnIndexTrackers[columnIndexToExtractFrom] ?? 0) - 1;

    if (item?.type === 'empty_space') {
      if (lastItem?.type !== 'empty_space') {
        rawDataInSequence[i] = {
          type: 'HEIGHT_EQUILIZER',
        };
      }
    } else if (item) {
      rawDataInSequence[i] = {
        height: item.height,
        isDraggable: item.isDraggable,
        item: item.item,
        type: 'ITEM',
      };
    }
    lastItem = item;
  }

  return { rawDataInSequence: rawDataInSequence.filter(Boolean) };
}

export const checkIfContainsCoordinates = (
  coordinates: Coordinates,
  vertices: Vertices
) =>
  coordinates.x > vertices.topLeft.x &&
  coordinates.y > vertices.topLeft.y &&
  coordinates.x < vertices.bottomRight.x &&
  coordinates.y < vertices.bottomRight.y;

export const checkForOverlap = (verticesA: Vertices, verticesB: Vertices) =>
  checkIfContainsCoordinates(verticesA.center, verticesB) ||
  checkIfContainsCoordinates(verticesB.center, verticesA);

export const getDistanceBetweenVertices = (
  coordinatesA: Coordinates,
  coordinatesB: Coordinates
) =>
  Math.sqrt(
    Math.pow(coordinatesA.x - coordinatesB.x, 2) +
      Math.pow(coordinatesA.y - coordinatesB.y, 2)
  );

const getViewMeasurements = (cardRef: RefObject<View> | undefined) =>
  new Promise<Parameters<MeasureOnSuccessCallback>>((res) =>
    cardRef?.current?.measure((...values) => res(values))
  );

export const getViewVertices = async (
  cardRef: RefObject<View> | undefined,
  options: { scale?: number; offsets?: Partial<Vertices> } = {}
): Promise<Vertices> => {
  const { scale = 1, offsets } = options;
  const cornerScale = (scale - 1) / 2 + 1;
  const [_x, _y, width, height, pageX, pageY] =
    await getViewMeasurements(cardRef);
  return {
    topCenter: {
      x: Math.round(pageX + width / 2 + (offsets?.center?.x ?? 0)),
      y: Math.round(pageY * cornerScale + (offsets?.topLeft?.y ?? 0)),
    },
    topLeft: {
      x: Math.round(pageX * cornerScale + (offsets?.topLeft?.x ?? 0)),
      y: Math.round(pageY * cornerScale + (offsets?.topLeft?.y ?? 0)),
    },
    topRight: {
      x: Math.round(
        (pageX + width) / cornerScale + (offsets?.topRight?.x ?? 0)
      ),
      y: Math.round(pageY * cornerScale + (offsets?.topRight?.y ?? 0)),
    },
    bottomCenter: {
      x: Math.round(pageX + width / 2 + (offsets?.center?.x ?? 0)),
      y: Math.round(
        (pageY + height) / cornerScale + (offsets?.bottomRight?.y ?? 0)
      ),
    },
    bottomRight: {
      x: Math.round(
        (pageX + width) / cornerScale + (offsets?.bottomRight?.x ?? 0)
      ),
      y: Math.round(
        (pageY + height) / cornerScale + (offsets?.bottomRight?.y ?? 0)
      ),
    },
    bottomLeft: {
      x: Math.round(pageX * cornerScale + (offsets?.bottomLeft?.x ?? 0)),
      y: Math.round(
        (pageY + height) / cornerScale + (offsets?.bottomLeft?.y ?? 0)
      ),
    },
    center: {
      x: Math.round(pageX + width / 2 + (offsets?.center?.x ?? 0)),
      y: Math.round(pageY + height / 2 + (offsets?.center?.y ?? 0)),
    },
  };
};

export function useStateRef<T>(
  initialValue: T
): [RefObject<T>, React.Dispatch<React.SetStateAction<T>>] {
  const [state, setState] = useState(initialValue);
  const stateRef = useRef(initialValue);
  stateRef.current = state;
  return [stateRef, setState];
}
