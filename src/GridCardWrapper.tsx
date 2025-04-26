import React, {
  forwardRef,
  useEffect,
  useImperativeHandle,
  useRef,
  useState,
} from 'react';
import { Animated, View } from 'react-native';
import { asyncWaitForMS, generateRandomInteger } from './utils';
import type {
  DraggableMasonryGridCardWrapperRef,
  GridCardWrapperProps,
  MasonaryGridWobbleAnimationConfig,
} from './types';

const defaultWobbleAnimationConfig: MasonaryGridWobbleAnimationConfig = {
  rotionAngleXDeg: 2,
  rotionAngleYDeg: 1,
  rotionAngleZDeg: 1.2,
  rotionAnimationTimeMS: 130,
};

export const GridCardWrapper = forwardRef(
  (
    props: GridCardWrapperProps,
    ref: React.Ref<DraggableMasonryGridCardWrapperRef>
  ) => {
    const viewRef = useRef<View>(null);
    const rotationAnimation = useRef(new Animated.Value(0)).current;
    const [shouldRender, setShouldRender] = useState(false);
    const {
      rotionAngleXDeg,
      rotionAngleYDeg,
      rotionAngleZDeg,
      rotionAnimationTimeMS,
    } = props.wobbleAnimationConfig ?? defaultWobbleAnimationConfig;

    useEffect(() => {
      if (!props.wobble) return;
      const animation = Animated.loop(
        Animated.sequence([
          Animated.timing(rotationAnimation, {
            duration: rotionAnimationTimeMS,
            toValue: 1,
            useNativeDriver: true,
          }),
          Animated.timing(rotationAnimation, {
            duration: rotionAnimationTimeMS,
            toValue: 0,
            useNativeDriver: true,
          }),
        ])
      );
      (async () => {
        await asyncWaitForMS(
          generateRandomInteger(0, Number.MAX_SAFE_INTEGER) % 500
        );
        animation.start();
      })();
      return () => {
        animation.stop();
        rotationAnimation.setValue(0);
      };
    }, [props.wobble, rotationAnimation, rotionAnimationTimeMS]);

    useImperativeHandle(
      ref,
      () => ({
        setShouldRender,
        viewRef,
      }),
      []
    );

    return (
      <Animated.View
        {...props.panHandlers}
        ref={viewRef}
        style={[
          props.style,
          {
            transform: [
              ...props.style.transform,
              {
                rotateX: rotationAnimation.interpolate({
                  inputRange: [-1, 0, 1],
                  outputRange: [
                    `-${rotionAngleXDeg}deg`,
                    '0deg',
                    `${rotionAngleXDeg}deg`,
                  ],
                }),
              },
              {
                rotateY: rotationAnimation.interpolate({
                  inputRange: [-1, 0, 1],
                  outputRange: [
                    `-${rotionAngleYDeg}deg`,
                    '0deg',
                    `${rotionAngleYDeg}deg`,
                  ],
                }),
              },
              {
                rotateZ: rotationAnimation.interpolate({
                  inputRange: [-1, 0, 1],
                  outputRange: [
                    `-${rotionAngleZDeg}deg`,
                    '0deg',
                    `${rotionAngleZDeg}deg`,
                  ],
                }),
              },
            ],
          },
        ]}
      >
        {props.alwaysRender || shouldRender ? props.children : null}
      </Animated.View>
    );
  }
);
