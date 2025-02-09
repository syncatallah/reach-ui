import React from "react";
import "../styles.css";
import {
  Slider,
  SliderHandle,
  SliderTrack,
  SliderTrackHighlight
} from "../src";
import { useAudio, timeToMs, msToTime } from "./utils";

export const name = "Audio Progress";

export const Example = () => {
  const [value, setValue] = React.useState(0);
  const [max, setMax] = React.useState(1000);
  const [audio, audioState, audioControls, audioRef] = useAudio({
    src: "http://techslides.com/demos/samples/sample.mp3",
    autoPlay: false,
    controls: true,
    onLoadedMetadata: function(event) {
      if (audioRef.current) {
        setMax(Math.round(timeToMs(audioRef.current.duration)));
      }
    }
  });

  function handleChange(newValue) {
    if (audioRef.current && audioControls) {
      audioControls.seek(newValue / 1000);
    }
  }

  React.useEffect(() => {
    if (audioState.time != null) {
      setValue(timeToMs(audioState.time));
    }
  }, [audioState.time]);

  return (
    <div>
      <Slider
        onChange={handleChange}
        value={value}
        min={0}
        max={max}
        getValueText={val => msToTime(val)}
      >
        <SliderTrack>
          <SliderTrackHighlight />
          <SliderHandle />
        </SliderTrack>
      </Slider>
      {audio}
    </div>
  );
};
