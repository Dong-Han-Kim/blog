import { getPostById } from '@/lib/posts';

interface PostPageParams {
  params: {
    category: string;
    slug: string;
  };
}

async function PostPage({ params }: PostPageParams) {
  const { category, slug } = await params;
  console.log(category);

  const post = await getPostById(category, slug);

  if (!post) {
    return <h1>포스트가 없습니다.</h1>;
  }
  const {
    title,
    date,
    tags,
    description,
    draft,
    keywords,
    thumbnail,
    content,
  } = post;

  return (
    <article className="w-full relative">
      <div className="text-center flex flex-col items-center mb-20">
        <h3 className="text-4xl font-extrabold">{title}</h3>
        <ul className="flex items-center text-xs text-gray-400 gap-5 my-8">
          {tags.map((keyword: string) => (
            <li key={keyword}>#{keyword}</li>
          ))}
        </ul>
        <p className="text-sm text-gray-400">{date}</p>
      </div>
      <div
        className="prose dark:prose-invert max-w-none"
        dangerouslySetInnerHTML={{ __html: content }}
      />
    </article>
  );
}

export default PostPage;
