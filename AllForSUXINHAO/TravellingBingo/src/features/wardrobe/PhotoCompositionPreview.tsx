import type { CSSProperties } from 'react'

import { getWardrobePhotoLayers } from '@/domain/game/wardrobe'
import type { WardrobeElement, WardrobePhoto, WardrobeTransform } from '@/domain/game/types'

import './PhotoCompositionPreview.css'

import { getWardrobeAssetVisual, getWardrobeTargetVisual } from './wardrobeAssets'

export interface PhotoPostcardVisual {
  url: string
  width: number
  height: number
  alt?: string
}

interface PhotoCompositionPreviewProps {
  photo: WardrobePhoto
  postcard?: PhotoPostcardVisual | null
  className?: string
  label?: string
  mode?: 'natural' | 'contain' | 'cover'
  decorative?: boolean
}

function elementKey(element: WardrobeElement, index: number) {
  return element.placementId || `${element.assetId}-${element.z}-${index}`
}

function scaledVisualStyle(transform: WardrobeTransform): CSSProperties {
  return {
    left: `${transform.x * 100}%`,
    top: `${transform.y * 100}%`,
    width: `${transform.scaleX * 100}%`,
    zIndex: transform.z,
    transform: `translate(-50%, -50%) rotate(${transform.rotation}deg) scaleY(${transform.scaleY / transform.scaleX})`,
  }
}

function elementStyle(element: WardrobeElement): CSSProperties {
  return scaledVisualStyle(element)
}

export function PhotoCompositionPreview({
  photo,
  postcard,
  className = '',
  label = '合拍预览',
  mode = 'natural',
  decorative = false,
}: PhotoCompositionPreviewProps) {
  const aspectRatio = postcard && postcard.height > 0 ? postcard.width / postcard.height : 4 / 3
  return (
    <div
      className={`photo-composition photo-composition--${mode} ${className}`.trim()}
      role={decorative ? undefined : 'img'}
      aria-label={decorative ? undefined : label}
      aria-hidden={decorative ? true : undefined}
      inert={decorative ? true : undefined}
      data-photo-id={photo.photoId}
      style={
        {
          '--photo-aspect-ratio': aspectRatio,
          aspectRatio:
            mode === 'natural'
              ? postcard && postcard.height > 0
                ? `${postcard.width} / ${postcard.height}`
                : '4 / 3'
              : undefined,
        } as CSSProperties
      }
    >
      <div className="photo-composition__canvas">
        {postcard && (
          <img
            className="photo-composition__postcard"
            src={postcard.url}
            alt=""
            width={postcard.width}
            height={postcard.height}
            draggable={false}
          />
        )}
        <div className="photo-composition__people" aria-hidden="true">
          {getWardrobePhotoLayers(photo).map((layer) => {
            if (layer.kind === 'decoration') {
              const decoration = layer.value
              const visual = getWardrobeAssetVisual(decoration.assetId)
              return (
                <img
                  className="photo-composition__decoration"
                  src={visual.url}
                  alt=""
                  width={visual.width}
                  height={visual.height}
                  style={scaledVisualStyle(decoration)}
                  data-decoration-id={decoration.placementId}
                  draggable={false}
                  key={`decoration-${decoration.placementId}`}
                />
              )
            }

            const participant = layer.value
            const target = getWardrobeTargetVisual(participant.targetId)
            return (
              <span
                className="photo-composition__participant"
                style={{
                  ...scaledVisualStyle(participant),
                  aspectRatio: `${target.width} / ${target.height}`,
                }}
                data-target-id={participant.targetId}
                key={`participant-${participant.targetId}`}
              >
                {[...participant.elements]
                  .map((element, index) => ({ element, index }))
                  .sort(
                    (left, right) => left.element.z - right.element.z || left.index - right.index,
                  )
                  .filter(({ element }) => element.z < 0)
                  .map(({ element, index }) => {
                    const visual = getWardrobeAssetVisual(element.assetId)
                    return (
                      <img
                        className="photo-composition__element"
                        src={visual.url}
                        alt=""
                        width={visual.width}
                        height={visual.height}
                        style={elementStyle(element)}
                        draggable={false}
                        key={elementKey(element, index)}
                      />
                    )
                  })}
                <img
                  className="photo-composition__character"
                  src={target.url}
                  alt=""
                  width={target.width}
                  height={target.height}
                  draggable={false}
                />
                {[...participant.elements]
                  .map((element, index) => ({ element, index }))
                  .sort(
                    (left, right) => left.element.z - right.element.z || left.index - right.index,
                  )
                  .filter(({ element }) => element.z >= 0)
                  .map(({ element, index }) => {
                    const visual = getWardrobeAssetVisual(element.assetId)
                    return (
                      <img
                        className="photo-composition__element"
                        src={visual.url}
                        alt=""
                        width={visual.width}
                        height={visual.height}
                        style={elementStyle(element)}
                        draggable={false}
                        key={elementKey(element, index)}
                      />
                    )
                  })}
              </span>
            )
          })}
        </div>
      </div>
    </div>
  )
}
