import { describe, expect, it } from 'vitest'

import { mountWithPlugins } from '@/tests/utils'

import TimestampText from './TimestampText.vue'

describe('TimestampText', () => {
  it('highlights references and emits resolved targets on click', async () => {
    const wrapper = mountWithPlugins(TimestampText, {
      props: {
        text: 'A 03:15 and t:04:20-04:30',
        defaultTarget: 'attachment',
      },
    })

    const buttons = wrapper.findAll('button')
    expect(buttons).toHaveLength(2)
    expect(buttons[0].text()).toBe('03:15')
    expect(buttons[1].text()).toBe('t:04:20-04:30')

    await buttons[0].trigger('click')
    await buttons[1].trigger('click')

    expect(wrapper.emitted('activate')).toEqual([
      [{ raw: '03:15', prefixTarget: null, startSeconds: 195, endSeconds: null, isRange: false, index: 2, length: 5 }, 'attachment'],
      [{ raw: 't:04:20-04:30', prefixTarget: 'track', startSeconds: 260, endSeconds: 270, isRange: true, index: 12, length: 13 }, 'track'],
    ])
  })
})
