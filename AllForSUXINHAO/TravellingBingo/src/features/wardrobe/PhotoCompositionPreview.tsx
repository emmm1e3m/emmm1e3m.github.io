import type { CSSProperties } from 'react'

import type { WardrobeElement, WardrobePhoto } from '@/domain/game/types'

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
}

function elementKey(element: WardrobeElement, index: number) {
  const placementId = 'placementId' in element ? String(element.placementId) : ''
  return placementId || `${element.assetId}-${element.z}-${index}`
}

function participantStyle(participant: WardrobePhoto['participants'][number]): CSSProperties {
  return {
    left: `${participant.x * 100}%`,
    top: `${participant.y * 100}%`,
    width: `${participant.scale * 100}%`,
    zIndex: participant.z,
    transform: `translate(-50%, -50%) rotate(${participant.rotation}deg)`,
  }
}

function elementStyle(element: WardrobeElement): CSSProperties {
  return {
    left: `${element.x * 100}%`,
    top: `${element.y * 100}%`,
    width: `${element.scale * 100}%`,
    zIndex: element.z,
    transform: `translate(-50%, -50%) rotate(${element.rotation}deg)`,
  }
}

export function PhotoCompositionPreview({
  photo,
  postcard,
  className = '',
  label = '合拍预览',
}: PhotoCompositionPreviewProps) {
  return (
    <div
      className={`photo-composition ${className}`.trim()}
      role="img"
      aria-label={label}
      data-photo-id={photo.photoId}
      style={postcard ? { aspectRatio: `${postcard.width} / ${postcard.height}` } : undefined}
    >
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
        {[...photo.participants]
          .sort((left, right) => left.z - right.z || left.targetId.localeCompare(right.targetId))
          .map((participant) => {
            const target = getWardrobeTargetVisual(participant.targetId)
            return (
              <span
                className="photo-composition__participant"
                style={participantStyle(participant)}
                data-target-id={participant.targetId}
                key={participant.targetId}
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
  )
}
