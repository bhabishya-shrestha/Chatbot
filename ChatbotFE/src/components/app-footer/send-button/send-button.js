import React, { useEffect, useCallback, useState } from "react";
import "./send-button.css";
import { useSelector, useDispatch } from "react-redux";
import {
  addMessage,
  setAudioBlobUrl,
  setIsRecordingSendPending,
  setIsResponseLoading,
  setIsTranscribeLoading,
  setTranscribeWebsocket,
} from "../../../redux/slices/chat-slice";
import { S3 } from "aws-sdk";
import axios from "axios";
import { Buffer } from "buffer";
import sendRequestToFastAPI from "../test-button/send-request-to-fastAPI";

export default function SendButton({ ws, text, setText }) {
  const dispatch = useDispatch();
  const { audioBlobUrl, transcribeWebsocket, isRecording, isRecordingSendPending } = useSelector(
    (state) => state.chat
  );

  const s3 = new S3({
    accessKeyId: process.env.REACT_APP_ACCESS_KEY_ID,
    secretAccessKey: process.env.REACT_APP_SECRET_ACCESS_KEY,
  });

  const sendAudio = useCallback(async () => {
    dispatch(setIsRecordingSendPending(false))
    dispatch(setIsTranscribeLoading(true));
    const fileName = `recording-${Date.now()}.mp3`;
    try {
      if (!audioBlobUrl) {
        console.error("Blob URL is empty.");
        return;
      }

      const response = await axios.get(audioBlobUrl, {
        responseType: "arraybuffer",
      });

      if (response.status === 200) {
        const audioBlob = Buffer.from(response.data);

        const params = {
          Bucket: "pre-transcribed-mp3-bucket",
          Key: fileName,
          Body: audioBlob,
        };

        s3.upload(params, (err, data) => {
          if (err) {
            console.error("Error uploading to S3:", err);
          }
        });
      } else {
        console.error("Failed to download audio.");
      }
    } catch (error) {
      console.error("Error:", error);
    } finally {
      dispatch(setAudioBlobUrl(""));
      if (ws) {
        const payload = {
          action: "startTranscription",
          message: fileName,
        };
        ws.json(payload);
      }
    }
  }, [audioBlobUrl, dispatch, s3]);

  const sendToFastAPI = (input) => {
    dispatch(addMessage({ messageType: "request", memo: input }));
    dispatch(setIsResponseLoading(true));
    setText("");
    const setChatbotResponse = (response) => {
      dispatch(addMessage({ messageType: "response", memo: response }));
      dispatch(setIsResponseLoading(false));
    };

    sendRequestToFastAPI(input, setChatbotResponse);
  };

  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.key === "Enter" && text.trim() !== "") {
        sendToFastAPI(text);
      }
    };

    window.addEventListener("keydown", handleKeyDown);

    return () => {
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [text, sendToFastAPI]);

  useEffect(() => {
    if (transcribeWebsocket !== "") {
      sendToFastAPI(transcribeWebsocket);
      dispatch(setTranscribeWebsocket(""));
    }
  }, [transcribeWebsocket]);

  const disableButton = isRecording || (text === "" && !isRecordingSendPending);

  return (
    <button
      className={audioBlobUrl !== "" ? "Send-Audio" : "Button"}
      onClick={audioBlobUrl !== "" ? sendAudio : () => sendToFastAPI(text.trim())}
      disabled={disableButton}
    >
      <i
        className={
          audioBlobUrl !== "" ? "material-icons audio" : "material-icons"
        }
      >
        send
      </i>
    </button>
  );
}
