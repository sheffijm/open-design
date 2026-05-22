// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { AssistantMessage } from '../../src/components/AssistantMessage';
import type { ChatMessage, ProjectFile } from '../../src/types';

function projectFile(name: string): ProjectFile {
  return {
    name,
    path: name,
    type: 'file',
    size: 128,
    mtime: 1700000000,
    kind: 'html',
    mime: 'text/html',
  };
}

describe('AssistantMessage local project links', () => {
  afterEach(() => cleanup());

  it('opens project html links in the current workspace instead of a new window', () => {
    const onRequestOpenFile = vi.fn();
    const message: ChatMessage = {
      id: 'assistant-local-link',
      role: 'assistant',
      content: '[premium-concept.html](/api/projects/project-1/raw/premium-concept.html)',
      events: [
        {
          kind: 'text',
          text: '[premium-concept.html](/api/projects/project-1/raw/premium-concept.html)',
        },
      ],
      startedAt: 1000,
      endedAt: 2000,
    };

    render(
      <AssistantMessage
        message={message}
        streaming={false}
        projectId="project-1"
        projectFiles={[projectFile('premium-concept.html')]}
        onRequestOpenFile={onRequestOpenFile}
      />,
    );

    const link = screen.getByRole('link', { name: 'premium-concept.html' });
    expect(link.getAttribute('target')).toBeNull();

    fireEvent.click(link);

    expect(onRequestOpenFile).toHaveBeenCalledWith('premium-concept.html');
  });
});
